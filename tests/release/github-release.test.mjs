import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { createClient, prepareRelease, publishRelease, verifyArchive } from '../../scripts/github-release.js'

const repository = 'null01024/mainsail-multitool'
const sha = 'a'.repeat(40)
const context = { repository, sha, runId: '100', runNumber: 10 }

function fixture({ tags = [], releases = [], assets = [], fail } = {}) {
    const refs = new Map(tags.map((tag) => [tag.name, tag.object ?? { type: 'commit', sha: tag.sha ?? sha }]))
    const objects = new Map(tags.filter((tag) => tag.annotation).map((tag) => [tag.object.sha, tag.annotation]))
    const state = { refs, releases, assets, updates: [] }
    const fetchImpl = async (url, options) => {
        const endpoint = new URL(url).pathname.replace(`/repos/${repository}`, '')
        const body = options.body ? JSON.parse(options.body) : undefined
        if (fail) return Response.json({ message: 'API unavailable' }, { status: 503 })
        if (endpoint === '/tags') {
            return Response.json([...refs].map(([name, object]) => ({ name, commit: { sha: object.sha } })))
        }
        if (endpoint === '/releases') return Response.json(releases)
        if (endpoint.startsWith('/git/ref/tags/')) {
            const object = refs.get(decodeURIComponent(endpoint.slice('/git/ref/tags/'.length)))
            return Response.json(object ? { object } : { message: 'Not Found' }, { status: object ? 200 : 404 })
        }
        if (endpoint === '/git/tags' && options.method === 'POST') {
            const objectSha = String(objects.size + 1).padStart(40, '0')
            objects.set(objectSha, { ...body, object: { sha: body.object, type: body.type } })
            return Response.json({ sha: objectSha }, { status: 201 })
        }
        if (endpoint.startsWith('/git/tags/')) return Response.json(objects.get(endpoint.split('/').at(-1)))
        if (endpoint === '/git/refs' && options.method === 'POST') {
            const name = body.ref.slice('refs/tags/'.length)
            if (refs.has(name)) return Response.json({ message: 'Reference already exists' }, { status: 422 })
            refs.set(name, { type: 'tag', sha: body.sha })
            return Response.json({ ref: body.ref }, { status: 201 })
        }
        if (/^\/releases\/\d+\/assets$/.test(endpoint)) return Response.json(assets)
        if (/^\/releases\/\d+$/.test(endpoint) && options.method === 'PATCH') {
            const release = releases.find((entry) => entry.id === Number(endpoint.split('/').at(-1)))
            Object.assign(release, body)
            state.updates.push(body)
            return Response.json(release)
        }
        throw new Error(`Unexpected GitHub request: ${options.method} ${endpoint}`)
    }
    return { client: createClient({ repository, token: 'test-token', fetchImpl }), state, fetchImpl }
}

function ownedRelease(plan, overrides = {}) {
    return { id: 1, tag_name: plan.tag, body: plan.marker, draft: true, prerelease: false, ...overrides }
}

test('allocates .3 after .2 and reserves the exact source SHA', async () => {
    const { client, state } = fixture({ tags: [{ name: 'v2.19.0-multitool.2' }] })
    const plan = await prepareRelease(client, context, '2.19.0-multitool.2')
    assert.equal(plan.version, '2.19.0-multitool.3')
    assert.equal(plan.completed, false)
    const object = state.refs.get('v2.19.0-multitool.3')
    const tag = await client.request('GET', `/git/tags/${object.sha}`)
    assert.deepEqual(tag.object, { type: 'commit', sha })
})

test('counts draft reservations and ignores other version families', async () => {
    const { client } = fixture({
        tags: [{ name: 'v2.19.0-multitool.2' }, { name: 'v2.20.0-multitool.99' }],
        releases: [{ tag_name: 'v2.19.0-multitool.3', draft: true }],
    })
    assert.equal((await prepareRelease(client, context, '2.19.0-multitool.2')).version, '2.19.0-multitool.4')
})

test('reuses a reservation after a build fails before draft creation', async () => {
    const { client } = fixture()
    const first = await prepareRelease(client, context, '2.19.0-multitool.2')
    const next = await prepareRelease(client, { ...context, runId: '101', runNumber: 11 }, '2.19.0-multitool.2')
    const retry = await prepareRelease(client, context, '2.19.0-multitool.2')
    assert.equal(next.version, '2.19.0-multitool.4')
    assert.equal(retry.version, first.version)
})

test('reuses an owned draft and skips an already published run', async () => {
    const { client, state } = fixture()
    const first = await prepareRelease(client, context, '2.19.0-multitool.2')
    state.releases.push(ownedRelease(first))
    assert.equal((await prepareRelease(client, context, '2.19.0-multitool.2')).tag, first.tag)
    state.releases[0].draft = false
    assert.equal((await prepareRelease(client, context, '2.19.0-multitool.2')).completed, true)
})

test('rejects a changed source SHA when retrying a run', async () => {
    const { client } = fixture()
    await prepareRelease(client, context, '2.19.0-multitool.2')
    await assert.rejects(
        prepareRelease(client, { ...context, sha: 'b'.repeat(40) }, '2.19.0-multitool.2'),
        /source|SHA/i
    )
})

test('manual versions cannot overwrite existing tags even at the same SHA', async () => {
    const { client } = fixture({ tags: [{ name: 'v2.19.0-multitool.3' }] })
    await assert.rejects(
        prepareRelease(client, context, '2.19.0-multitool.2', '2.19.0-multitool.3'),
        /already|reserved/i
    )
})

test('rejects changed tag targets and tag ownership on retry', async () => {
    const { client, state } = fixture()
    const plan = await prepareRelease(client, context, '2.19.0-multitool.2')
    state.releases.push(ownedRelease(plan))
    state.refs.set(plan.tag, { type: 'commit', sha: 'b'.repeat(40) })
    await assert.rejects(prepareRelease(client, context, '2.19.0-multitool.2'), /source|SHA|owner/i)
    state.refs.set(plan.tag, { type: 'commit', sha })
    await assert.rejects(prepareRelease(client, context, '2.19.0-multitool.2'), /owner|reserved/i)
})

test('invalid manual versions cannot reach tag creation', async () => {
    const { client, state } = fixture()
    for (const version of ['$(false)', '2.19', '2.19.0-multitool.01']) {
        await assert.rejects(prepareRelease(client, context, '2.19.0-multitool.2', version), /version/i)
    }
    assert.equal(state.refs.size, 0)
})

test('API failures stop allocation instead of using an empty release list', async () => {
    const { client, state } = fixture({ fail: true })
    await assert.rejects(prepareRelease(client, context, '2.19.0-multitool.2'), /503/)
    assert.equal(state.refs.size, 0)
})

test('follows GitHub pagination when allocating versions', async () => {
    const backing = fixture()
    const client = createClient({
        repository,
        token: 'test-token',
        fetchImpl: async (url, options) => {
            const parsed = new URL(url)
            if (parsed.pathname.endsWith('/releases')) {
                if (parsed.searchParams.get('page') === '2') {
                    return Response.json([{ tag_name: 'v2.19.0-multitool.20', draft: true }])
                }
                return Response.json([], {
                    headers: { Link: `<https://api.github.com/repos/${repository}/releases?page=2>; rel="next"` },
                })
            }
            return backing.fetchImpl(url, options)
        },
    })
    assert.equal((await prepareRelease(client, context, '2.19.0-multitool.2')).version, '2.19.0-multitool.21')
})

async function withArchive(callback, { version = 'v2.19.0-multitool.3', owner = 'null01024', index = true } = {}) {
    const directory = await mkdtemp(path.join(tmpdir(), 'mainsail-release-test-'))
    try {
        await writeFile(path.join(directory, '.version'), version)
        await writeFile(
            path.join(directory, 'release_info.json'),
            JSON.stringify({ project_owner: owner, project_name: 'mainsail-multitool', version })
        )
        if (index) await writeFile(path.join(directory, 'index.html'), '<html>mainsail</html>')
        const file = path.join(directory, 'mainsail.zip')
        execFileSync('zip', ['-q', file, '.version', 'release_info.json', ...(index ? ['index.html'] : [])], {
            cwd: directory,
        })
        return await callback(file)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}

test('verifies real archive contents before creating a draft', async () => {
    await withArchive((file) => assert.doesNotThrow(() => verifyArchive(file, 'v2.19.0-multitool.3')))
    await withArchive((file) => assert.throws(() => verifyArchive(file, 'v2.19.0-multitool.4'), /version/i))
    await withArchive((file) => assert.throws(() => verifyArchive(file, 'v2.19.0-multitool.3'), /repository/i), {
        owner: 'mainsail-crew',
    })
    await withArchive((file) => assert.throws(() => verifyArchive(file, 'v2.19.0-multitool.3'), /index.html/i), {
        index: false,
    })
})

test('publishes only after verifying the uploaded asset size and SHA-256', async () => {
    await withArchive(async (file) => {
        const bytes = await readFile(file)
        const { client, state } = fixture()
        const plan = await prepareRelease(client, context, '2.19.0-multitool.2')
        state.releases.push(ownedRelease(plan))
        state.assets.push({ name: 'mainsail.zip', state: 'uploaded', size: bytes.length, digest: 'sha256:wrong' })
        await assert.rejects(publishRelease(client, context, plan.tag, file), /digest|SHA-256/i)
        assert.equal(state.releases[0].draft, true)
        state.assets[0].digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
        await publishRelease(client, context, plan.tag, file)
        assert.equal(state.releases[0].draft, false)
        assert.equal(state.updates[0].prerelease, false)
        assert.equal(state.updates[0].make_latest, 'true')
    })
})

test('old runs publish without taking Latest from a newer successful push', async () => {
    await withArchive(async (file) => {
        const { client, state } = fixture()
        const older = await prepareRelease(client, context, '2.19.0-multitool.2')
        const newer = await prepareRelease(client, { ...context, runId: '101', runNumber: 11 }, '2.19.0-multitool.2')
        state.releases.push(ownedRelease(older), ownedRelease(newer, { id: 2, draft: false }))
        const bytes = await readFile(file)
        state.assets.push({
            name: 'mainsail.zip',
            state: 'uploaded',
            size: bytes.length,
            digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        })
        await publishRelease(client, context, older.tag, file)
        assert.equal(state.updates[0].make_latest, 'false')
        await publishRelease(client, context, older.tag, file)
        assert.equal(state.updates.length, 1)
    })
})

test('a lower manual version cannot take Latest from a higher published version', async () => {
    await withArchive(
        async (file) => {
            const { client, state } = fixture({
                tags: [{ name: 'v2.19.0-multitool.10' }],
                releases: [{ id: 2, tag_name: 'v2.19.0-multitool.10', body: '', draft: false, prerelease: false }],
            })
            const plan = await prepareRelease(client, context, '2.19.0-multitool.2', '2.19.0-multitool.1')
            state.releases.push(ownedRelease(plan))
            const bytes = await readFile(file)
            state.assets.push({
                name: 'mainsail.zip',
                state: 'uploaded',
                size: bytes.length,
                digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
            })
            await publishRelease(client, context, plan.tag, file)
            assert.equal(state.updates[0].make_latest, 'false')
        },
        { version: 'v2.19.0-multitool.1' }
    )
})
