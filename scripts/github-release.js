import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import semver from 'semver'

const repositoryName = 'null01024/mainsail-multitool'
const markerPattern = /<!-- mainsail-release (\{[^\n]+\}) -->/

export function createClient({ repository, token, fetchImpl = fetch }) {
    if (!token) throw new Error('GITHUB_TOKEN is required')
    const base = `https://api.github.com/repos/${repository}`
    const send = async (method, endpoint, body) => {
        const url = endpoint.startsWith('https://') ? endpoint : `${base}${endpoint}`
        if (!url.startsWith(`${base}/`)) throw new Error('Unexpected GitHub API URL')
        const response = await fetchImpl(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (!response.ok) {
            const error = new Error(`GitHub ${method} ${endpoint}: ${response.status} ${await response.text()}`)
            error.status = response.status
            throw error
        }
        return response
    }
    return {
        request: async (method, endpoint, body) => (await send(method, endpoint, body)).json(),
        list: async (endpoint) => {
            const entries = []
            let next = `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100`
            while (next) {
                const response = await send('GET', next)
                const page = await response.json()
                if (!Array.isArray(page)) throw new Error(`Expected a GitHub list: ${endpoint}`)
                entries.push(...page)
                next = response.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1]
            }
            return entries
        },
    }
}

function readMarker(text) {
    const match = text?.match(markerPattern)
    return match ? JSON.parse(match[1]) : null
}

function assertContext(context) {
    if (
        context.repository !== repositoryName ||
        !/^[a-f0-9]{40}$/.test(context.sha) ||
        !/^\d+$/.test(context.runId) ||
        !Number.isSafeInteger(context.runNumber) ||
        context.runNumber < 1
    ) {
        throw new Error('Invalid release repository, source SHA, or workflow run')
    }
}

function assertOwner(marker, context, tag) {
    if (marker?.runId !== context.runId || `v${marker?.version}` !== tag) {
        throw new Error(`Release/tag ${tag} is already reserved by another owner`)
    }
    if (marker.sha !== context.sha || marker.runNumber !== context.runNumber) {
        throw new Error(`Release/tag ${tag} has a different source SHA or workflow run`)
    }
}

async function readTag(client, tag) {
    let ref
    try {
        ref = await client.request('GET', `/git/ref/tags/${encodeURIComponent(tag)}`)
    } catch (error) {
        if (error.status === 404) return null
        throw error
    }
    let object = ref.object
    let marker = null
    for (let depth = 0; depth < 10; depth++) {
        if (object.type === 'commit') return { sha: object.sha, marker }
        if (object.type !== 'tag') throw new Error(`Tag ${tag} does not target a commit`)
        const annotation = await client.request('GET', `/git/tags/${object.sha}`)
        marker ??= readMarker(annotation.message)
        object = annotation.object
    }
    throw new Error(`Tag ${tag} has too many nested annotations`)
}

async function verifyTag(client, context, tag) {
    const existing = await readTag(client, tag)
    if (!existing || existing.sha !== context.sha) throw new Error(`Tag ${tag} has a different or missing source SHA`)
    assertOwner(existing.marker, context, tag)
}

function nextVersion(packageVersion, names) {
    const match = packageVersion.match(/^(\d+\.\d+\.\d+-multitool\.)(\d+)$/)
    if (!match || !semver.valid(packageVersion)) {
        throw new Error('Automatic version requires a package version such as 2.19.0-multitool.2')
    }
    let highest = BigInt(match[2])
    for (const name of names) {
        const version = name.replace(/^v/, '')
        if (!semver.valid(version) || !version.startsWith(match[1])) continue
        const suffix = version.slice(match[1].length)
        if (/^\d+$/.test(suffix) && BigInt(suffix) > highest) highest = BigInt(suffix)
    }
    const version = `${match[1]}${highest + 1n}`
    if (!semver.valid(version)) throw new Error('Automatic release version exceeds the supported SemVer range')
    return version
}

export async function prepareRelease(client, context, packageVersion, requestedVersion = '') {
    assertContext(context)
    const requested = requestedVersion.replace(/^v/, '')
    if (requested && !semver.valid(requested)) throw new Error('Invalid manual release version')
    const [tags, releases] = await Promise.all([client.list('/tags'), client.list('/releases')])
    const previousTags = releases
        .filter((release) => !release.draft && !release.prerelease && semver.valid(release.tag_name))
        .map((release) => release.tag_name)
        .sort(semver.rcompare)
    const owned = releases.filter((release) => readMarker(release.body)?.runId === context.runId)
    if (owned.length > 1) throw new Error('Multiple releases claim this workflow run')
    if (owned.length) {
        const release = owned[0]
        const marker = readMarker(release.body)
        assertOwner(marker, context, release.tag_name)
        if (requested && requested !== marker.version) throw new Error('Manual version changed on retry')
        await verifyTag(client, context, release.tag_name)
        return {
            version: marker.version,
            tag: release.tag_name,
            marker: `<!-- mainsail-release ${JSON.stringify(marker)} -->`,
            completed: !release.draft,
            previousTags,
        }
    }

    // An annotated version tag persists allocation even if the build fails before a draft exists.
    const releasedTags = new Set(releases.map((release) => release.tag_name))
    for (const tag of tags.filter((entry) => !releasedTags.has(entry.name) && entry.name.startsWith('v'))) {
        const reservation = await readTag(client, tag.name)
        if (reservation?.marker?.runId !== context.runId) continue
        assertOwner(reservation.marker, context, tag.name)
        if (reservation.sha !== context.sha) throw new Error(`Tag ${tag.name} has a different source SHA`)
        if (requested && requested !== reservation.marker.version) throw new Error('Manual version changed on retry')
        return {
            version: reservation.marker.version,
            tag: tag.name,
            marker: `<!-- mainsail-release ${JSON.stringify(reservation.marker)} -->`,
            completed: false,
            previousTags,
        }
    }

    const names = [...tags.map((tag) => tag.name), ...releases.map((release) => release.tag_name)]
    const version = requested || nextVersion(packageVersion, names)
    const tag = `v${version}`
    if (names.includes(tag) || (await readTag(client, tag))) throw new Error(`Version ${tag} is already reserved`)
    const marker = `<!-- mainsail-release ${JSON.stringify({ ...context, version })} -->`
    const annotation = await client.request('POST', '/git/tags', {
        tag,
        message: marker,
        object: context.sha,
        type: 'commit',
    })
    await client.request('POST', '/git/refs', { ref: `refs/tags/${tag}`, sha: annotation.sha })
    return { version, tag, marker, completed: false, previousTags }
}

export function verifyArchive(file, tag) {
    const read = (entry) =>
        execFileSync('unzip', ['-p', file, entry], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    execFileSync('unzip', ['-tq', file], { stdio: 'pipe' })
    if (read('.version').trim() !== tag) throw new Error('Archive version does not match the release tag')
    const info = JSON.parse(read('release_info.json'))
    if (`${info.project_owner}/${info.project_name}` !== repositoryName) {
        throw new Error('Archive repository does not match the release repository')
    }
    if (info.version !== tag) throw new Error('Archive release_info version does not match the release tag')
    if (!read('index.html').trim()) throw new Error('Archive is missing index.html')
}

export async function publishRelease(client, context, tag, file) {
    assertContext(context)
    await verifyTag(client, context, tag)
    const releases = await client.list('/releases')
    const release = releases.find((entry) => entry.tag_name === tag)
    if (!release) throw new Error(`Release ${tag} was not created`)
    assertOwner(readMarker(release.body), context, tag)
    if (!release.draft) return
    verifyArchive(file, tag)
    const assets = await client.list(`/releases/${release.id}/assets`)
    const asset = assets.find((entry) => entry.name === 'mainsail.zip')
    const bytes = fs.readFileSync(file)
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    if (!asset || asset.state !== 'uploaded' || asset.size !== bytes.length || asset.digest !== digest) {
        throw new Error('Uploaded mainsail.zip is missing or its size/SHA-256 digest does not match')
    }
    const newer = releases.some((entry) => {
        if (entry.draft || entry.prerelease) return false
        if (semver.valid(entry.tag_name) && semver.gt(entry.tag_name, tag)) return true
        const marker = readMarker(entry.body)
        return marker && marker.runNumber > context.runNumber
    })
    await client.request('PATCH', `/releases/${release.id}`, {
        draft: false,
        prerelease: false,
        make_latest: newer ? 'false' : 'true',
    })
}

async function main() {
    const context = {
        repository: process.env.GITHUB_REPOSITORY,
        sha: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        runNumber: Number(process.env.GITHUB_RUN_NUMBER),
    }
    const command = process.argv[2]
    const directory = path.join(process.env.RUNNER_TEMP ?? '.', 'mainsail-release')
    const archive = path.join(directory, 'mainsail.zip')
    const planFile = path.join(directory, 'plan.json')
    if (command === 'verify') {
        verifyArchive(archive, process.env.RELEASE_TAG)
        return
    }
    if (command === 'notes') {
        const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
        const changes = fs.readFileSync(path.join(directory, 'changes.md'), 'utf8')
        const url = `https://github.com/${context.repository}`
        fs.writeFileSync(
            path.join(directory, 'release-notes.md'),
            `${plan.marker}\n\nSource: [${context.sha}](${url}/commit/${context.sha})\n` +
                `Build: [#${context.runNumber}](${url}/actions/runs/${context.runId})\n\n${changes}`
        )
        return
    }
    if (
        !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME) ||
        process.env.GITHUB_REF !== 'refs/heads/develop'
    ) {
        throw new Error('Releases only run for develop pushes or manual dispatches on develop')
    }
    const client = createClient({ repository: context.repository, token: process.env.GITHUB_TOKEN })
    if (command === 'publish') {
        await publishRelease(client, context, process.env.RELEASE_TAG, archive)
        return
    }
    if (command !== 'prepare') throw new Error('Expected prepare, notes, verify, or publish')
    const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const plan = await prepareRelease(client, context, version, process.env.RELEASE_VERSION)
    const previousTag = plan.previousTags.find((tag) => {
        if (tag === plan.tag) return false
        try {
            execFileSync('git', ['merge-base', '--is-ancestor', tag, context.sha], { stdio: 'ignore' })
            return true
        } catch {
            return false
        }
    })
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(planFile, JSON.stringify(plan))
    fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `version=${plan.version}\ntag=${plan.tag}\ncompleted=${plan.completed}\n` +
            `changelog_range=${previousTag ? `${previousTag}..` : ''}${context.sha}\n`
    )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = 1
    })
}
