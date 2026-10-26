<template>
    <panel
        v-if="showPanel"
        :icon="mdiSwapHorizontal"
        :title="$t('Panels.ToolchangerPanel.Headline')"
        :collapsible="true"
        card-class="toolchanger-panel">
        <template #buttons>
            <v-tooltip top>
                <template #activator="{ on, attrs }">
                    <v-btn icon tile v-bind="attrs" v-on="on" @click="showSettingsDialog = true">
                        <v-icon small>{{ mdiCog }}</v-icon>
                    </v-btn>
                </template>
                <span>{{ $t('Panels.ToolchangerPanel.Settings') }}</span>
            </v-tooltip>
        </template>

        <div v-if="showStatusBar" class="status-bar">
            <span v-if="hasClamp" class="chip" :class="clampChipClass" :title="$t('Panels.ToolchangerPanel.Clamp')">
                <span class="chip-icon">{{ clampIcon }}</span>
                {{ clampText }}
            </span>
            <span v-if="hasOffsets" class="chip neutral" :title="$t('Panels.ToolchangerPanel.Offset')">
                <span class="chip-icon">⌖</span>
                {{ offsetChipText }}
                <span v-if="offsetsAdaptive" class="chip-tag">{{ $t('Panels.ToolchangerPanel.AdaptiveZ') }}</span>
            </span>
        </div>

        <div v-if="showSwapBanner" class="banner swap-banner">
            <div class="banner-head">
                <span class="banner-spinner"></span>
                <strong>{{ $t('Panels.ToolchangerPanel.SwapActive') }}</strong>
                <span v-if="swapTargetTool !== null" class="banner-route">T{{ swapTargetTool }}</span>
                <span class="banner-elapsed">
                    {{ $t('Panels.ToolchangerPanel.SwapElapsed', { time: formatDuration(statsCurrent.elapsed) }) }}
                </span>
            </div>
            <div class="stage-track">
                <template v-for="(stage, index) in stageSteps">
                    <span :key="stage.key" class="stage-step" :class="stage.state">
                        <span class="stage-dot">{{ stageMark(stage, index) }}</span>
                        {{ stage.label }}
                        <span class="stage-time">{{ formatDuration(stage.seconds) }}</span>
                    </span>
                    <span v-if="index < stageSteps.length - 1" :key="`${stage.key}-sep`" class="stage-sep"></span>
                </template>
            </div>
        </div>

        <div v-if="showRunoutBanner" class="banner runout-banner">
            <div class="banner-head">
                <span class="banner-warn-icon">!</span>
                <strong>{{ $t('Panels.ToolchangerPanel.RunoutActive') }}</strong>
                <span class="banner-route">
                    T{{ runoutTool }}
                    <template v-if="runoutNextTool !== null">
                        <span class="route-arrow">→</span>
                        T{{ runoutNextTool }}
                    </template>
                    <template v-else>{{ $t('Panels.ToolchangerPanel.RunoutNoContinuation') }}</template>
                </span>
                <span class="banner-elapsed">
                    {{
                        $t('Panels.ToolchangerPanel.RunoutRemaining', {
                            remaining: runoutRemainingText,
                            total: runoutContinueLengthText,
                        })
                    }}
                </span>
            </div>
            <div v-if="runoutContinueLength > 0" class="runout-bar">
                <span :style="{ width: `${runoutProgress}%` }"></span>
            </div>
        </div>

        <v-card-text ref="toolchangerCard" class="toolchanger-card" :style="rackStyle">
            <div v-if="tools.length" class="toolchanger-rack">
                <div class="rack-inner">
                    <div class="toolchanger-spools" :class="{ busy: isSwapActive }">
                        <div
                            v-for="(tool, position) in displayTools"
                            :key="tool.index"
                            class="toolchanger-channel"
                            :class="channelClasses(tool)">
                            <v-tooltip top :open-delay="500">
                                <template #activator="{ on, attrs }">
                                    <button
                                        :ref="`spoolButton${tool.index}`"
                                        class="spool-button"
                                        :class="spoolButtonClasses(tool)"
                                        :style="spoolStyle(tool)"
                                        type="button"
                                        :aria-label="spoolAriaLabel(tool)"
                                        :aria-pressed="tool.isCurrent.toString()"
                                        v-bind="attrs"
                                        v-on="on"
                                        @click="openSpoolDialog(tool.index)">
                                        <svg
                                            class="spool-svg"
                                            viewBox="0 0 248 500"
                                            preserveAspectRatio="xMidYMid meet">
                                            <defs>
                                                <path
                                                    :id="`tc-oval-${tool.index}`"
                                                    d="M 0 -63 C 35 -63 63 -35 63 0 C 63 35 35 63 0 63 C -35 63 -63 35 -63 0 C -63 -35 -35 -63 0 -63 z"
                                                    vector-effect="non-scaling-stroke" />
                                                <path
                                                    :id="`tc-center-${tool.index}`"
                                                    d="M 0 -63 C 35 -63 63 -35 63 0 C 63 35 35 63 0 63 L -624 63 L -624 -63 z"
                                                    vector-effect="non-scaling-stroke" />
                                                <radialGradient
                                                    :id="`tc-spotlight-${tool.index}`"
                                                    cx="50%"
                                                    cy="70%"
                                                    r="50%"
                                                    fx="50%"
                                                    fy="100%">
                                                    <stop
                                                        offset="0%"
                                                        stop-color="rgba(255, 255, 255, 0.75)"
                                                        stop-opacity="1" />
                                                    <stop
                                                        offset="100%"
                                                        stop-color="rgba(255, 255, 255, 0)"
                                                        stop-opacity="0" />
                                                </radialGradient>
                                            </defs>
                                            <g transform="matrix(0.59,0,0,3.95,197,250)" class="spool-wheel-right">
                                                <use :href="`#tc-oval-${tool.index}`" class="spool-wheel" />
                                                <use
                                                    :href="`#tc-oval-${tool.index}`"
                                                    transform="scale(0.41)"
                                                    class="spool-wheel" />
                                                <use
                                                    :href="`#tc-center-${tool.index}`"
                                                    transform="scale(0.41)"
                                                    class="spool-wheel" />
                                            </g>
                                            <path
                                                v-if="drawFilament(tool)"
                                                d="M 0 -63 C 35 -63 63 -35 63 0 C 63 35 35 63 0 63 L -424 63 L -424 -63 z"
                                                vector-effect="non-scaling-stroke"
                                                class="spool-filament"
                                                :transform="filamentTransform(tool)" />
                                            <g transform="matrix(0.59,0,0,3.95,37,250)" class="spool-wheel-left">
                                                <use :href="`#tc-oval-${tool.index}`" class="spool-wheel" />
                                                <use
                                                    :href="`#tc-oval-${tool.index}`"
                                                    transform="scale(0.41)"
                                                    fill="#111111" />
                                            </g>
                                            <rect
                                                v-if="tool.isCurrent"
                                                x="0"
                                                y="314"
                                                width="258"
                                                height="186"
                                                :fill="`url(#tc-spotlight-${tool.index})`" />
                                            <text
                                                v-if="tool.loaded === false"
                                                x="117"
                                                y="270"
                                                text-anchor="middle"
                                                font-weight="800"
                                                font-size="52px"
                                                class="spool-empty-label">
                                                {{ $t('Panels.ToolchangerPanel.EmptyShort') }}
                                            </text>
                                            <text
                                                v-else-if="isUnknownTool(tool)"
                                                x="117"
                                                y="270"
                                                text-anchor="middle"
                                                font-weight="800"
                                                font-size="60px"
                                                class="spool-unknown-label">
                                                {{ $t('Panels.ToolchangerPanel.UnknownShort') }}
                                            </text>
                                            <text
                                                v-else
                                                x="146"
                                                y="270"
                                                text-anchor="middle"
                                                font-weight="800"
                                                font-size="56px"
                                                class="spool-percent-svg">
                                                {{ percentText(tool) }}
                                            </text>
                                        </svg>
                                    </button>
                                </template>
                                <div class="white-space-pre-line">{{ tooltipText(tool) }}</div>
                            </v-tooltip>

                            <div
                                class="toolchanger-channel-box"
                                :class="{ first: position === 0, last: position === tools.length - 1 }">
                                <button
                                    class="channel-button"
                                    :class="{ active: tool.isCurrent }"
                                    type="button"
                                    :title="toolButtonTitle(tool)"
                                    :disabled="!canSend"
                                    @click="selectTool(tool.index)">
                                    {{ tool.index }}
                                </button>
                            </div>

                            <div class="group-marker">
                                <span
                                    v-if="groupMarker(tool)"
                                    class="group-dot"
                                    :style="{ background: groupMarker(tool)?.color }"
                                    :title="groupMarkerTitle(tool)"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-else class="text--disabled text-center py-3">
                {{ $t('Panels.ToolchangerPanel.NoTools') }}
            </div>

            <spoolman-change-spool-dialog
                v-if="existsSpoolman"
                v-model="showSpoolDialog"
                :set-active-spool="false"
                @select-spool="setToolSpool" />

            <v-dialog v-model="showSettingsDialog" max-width="460">
                <v-card>
                    <v-card-title>{{ $t('Panels.ToolchangerPanel.Settings') }}</v-card-title>
                    <v-card-text>
                        <div class="settings-field">
                            <div class="settings-title">{{ $t('Panels.ToolchangerPanel.ToolOrderDirection') }}</div>
                            <v-radio-group v-model="toolOrderDirection" class="mt-1" hide-details>
                                <v-radio
                                    :label="$t('Panels.ToolchangerPanel.ToolOrderLeftToRight')"
                                    value="left-to-right" />
                                <v-radio
                                    :label="$t('Panels.ToolchangerPanel.ToolOrderRightToLeft')"
                                    value="right-to-left" />
                            </v-radio-group>
                        </div>
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer />
                        <v-btn text color="primary" @click="showSettingsDialog = false">
                            {{ $t('Panels.ToolchangerPanel.Close') }}
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>
        </v-card-text>

        <div v-if="continuationGroups.length" class="collapsible-section">
            <button
                class="section-toggle"
                type="button"
                :aria-expanded="groupsExpanded.toString()"
                @click="togglePersistentSection('groups')">
                <span>{{ $t('Panels.ToolchangerPanel.ContinuationGroups') }}</span>
                <v-icon x-small class="section-toggle-icon" :class="{ collapsed: !groupsExpanded }">
                    {{ mdiChevronDown }}
                </v-icon>
            </button>
            <v-expand-transition>
                <div v-show="groupsExpanded" class="group-panel">
                    <div class="group-rows">
                        <div v-for="group in continuationGroups" :key="group.index" class="group-row">
                            <span class="grp-swatch" :style="{ background: group.color }"></span>
                            <span class="grp-name">
                                {{ $t('Panels.ToolchangerPanel.GroupName', { group: group.index + 1 }) }}
                            </span>
                            <span class="grp-route">
                                <template v-for="(tool, index) in group.members">
                                    <span :key="`tool-${tool}`">T{{ tool }}</span>
                                    <span
                                        v-if="index < group.members.length - 1"
                                        :key="`arrow-${tool}`"
                                        class="grp-arrow">
                                        →
                                    </span>
                                </template>
                            </span>
                        </div>
                    </div>
                </div>
            </v-expand-transition>
        </div>

        <div v-if="hasStats" class="collapsible-section">
            <button
                class="section-toggle"
                type="button"
                :aria-expanded="statsExpanded.toString()"
                @click="togglePersistentSection('stats')">
                <span>{{ $t('Panels.ToolchangerPanel.StatsStageBreakdown') }}</span>
                <v-icon x-small class="section-toggle-icon" :class="{ collapsed: !statsExpanded }">
                    {{ mdiChevronDown }}
                </v-icon>
            </button>
            <v-expand-transition>
                <div v-show="statsExpanded" class="stats-panel">
                    <div class="stats-overview">
                        <div class="stat-primary">
                            <div class="stat-label">{{ statsAverageCard.label }}</div>
                            <div class="stat-value">{{ statsAverageCard.value }}</div>
                        </div>
                        <div class="stat-metrics">
                            <div v-for="card in statsSecondaryCards" :key="card.label" class="stat-metric">
                                <div class="stat-label">{{ card.label }}</div>
                                <div class="stat-value">
                                    {{ card.value }}
                                    <span v-if="card.unit" class="stat-unit">{{ card.unit }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="stage-breakdown">
                        <div class="stage-breakdown-title">{{ $t('Panels.ToolchangerPanel.StatsStageBreakdown') }}</div>
                        <div class="stage-bar">
                            <span
                                v-for="stage in stageBreakdown"
                                :key="stage.key"
                                class="stage-seg"
                                :style="{ width: `${stage.percent}%`, background: stage.color }"
                                :title="`${stage.label} ${formatDuration(stage.seconds)}`"></span>
                        </div>
                        <div class="stage-legends">
                            <span v-for="stage in stageBreakdown" :key="`${stage.key}-legend`" class="stage-legend">
                                <span class="legend-dot" :style="{ background: stage.color }"></span>
                                {{ stage.label }} {{ formatDuration(stage.seconds) }}
                                <span class="legend-pct">{{ stage.percent }}%</span>
                            </span>
                        </div>
                    </div>
                </div>
            </v-expand-transition>
        </div>

        <div v-if="showOffsetTable" class="collapsible-section">
            <button
                class="section-toggle"
                type="button"
                :aria-expanded="offsetsExpanded.toString()"
                @click="togglePersistentSection('offsets')">
                <span>{{ $t('Panels.ToolchangerPanel.OffsetTableTitle') }}</span>
                <v-icon x-small class="section-toggle-icon" :class="{ collapsed: !offsetsExpanded }">
                    {{ mdiChevronDown }}
                </v-icon>
            </button>
            <v-expand-transition>
                <div v-show="offsetsExpanded" class="offset-table">
                    <div class="off-grid">
                        <div
                            v-for="cell in offsetCells"
                            :key="cell.tool"
                            class="off-cell"
                            :class="{ current: cell.current, uncal: !cell.calibrated && !cell.base }">
                            <div class="off-head">
                                T{{ cell.tool }}
                                <span v-if="cell.base" class="off-tag base">
                                    {{ $t('Panels.ToolchangerPanel.OffsetBase') }}
                                </span>
                                <span v-if="cell.current" class="off-tag current">
                                    {{ $t('Panels.ToolchangerPanel.OffsetCurrent') }}
                                </span>
                                <span v-if="!cell.calibrated && !cell.base" class="off-tag none">
                                    {{ $t('Panels.ToolchangerPanel.OffsetUncalibrated') }}
                                </span>
                            </div>
                            <div class="off-vals">
                                <span>
                                    X
                                    <b>{{ formatOffset(cell.x) }}</b>
                                </span>
                                <span>
                                    Y
                                    <b>{{ formatOffset(cell.y) }}</b>
                                </span>
                                <span>
                                    Z
                                    <b>{{ formatOffset(cell.z) }}</b>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </v-expand-transition>
        </div>
    </panel>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import SpoolmanChangeSpoolDialog from '@/components/dialogs/SpoolmanChangeSpoolDialog.vue'
import { ServerSpoolmanStateSpool } from '@/store/server/spoolman/types'
import { mdiChevronDown, mdiCog, mdiSwapHorizontal } from '@mdi/js'

type ToolchangeStageKey = 'release' | 'pickup' | 'heat_wait'
type ClampState = 'clamped' | 'released' | 'unknown'
type ToolOrderDirection = 'left-to-right' | 'right-to-left'

interface ToolchangerTool {
    index: number
    name: string
    loaded: boolean | null
    spoolId: number
    spool: ServerSpoolmanStateSpool | null
    color: string
    percent: number | null
    amountText: string
    isCurrent: boolean
}

interface RgbColor {
    r: number
    g: number
    b: number
}

interface StageStats {
    release?: number
    pickup?: number
    heat_wait?: number
}

interface ToolchangeStatsScope {
    count?: number
    elapsed?: number
    stages?: StageStats
}

interface ToolchangeCurrentStats {
    active?: boolean
    elapsed?: number
    stages?: StageStats
    active_stage?: ToolchangeStageKey | null
}

interface ToolchangeDailyCount {
    date: string
    count: number
}

interface ToolchangeStatsStatus {
    tc_current?: ToolchangeCurrentStats
    tc_print?: ToolchangeStatsScope
    tc_total?: ToolchangeStatsScope
    tc_daily?: ToolchangeDailyCount[]
}

interface ContinuationGroup {
    index: number
    members: number[]
    color: string
}

interface GroupMarker {
    group: number
    order: number
    color: string
}

interface OffsetCell {
    tool: number
    x: number
    y: number
    z: number
    base: boolean
    current: boolean
    calibrated: boolean
}

const GROUP_COLORS = ['#4da6ff', '#ff9f43', '#c47adf', '#00c4a7', '#ff6b6b', '#ffd23f']
const STAGE_KEYS: ToolchangeStageKey[] = ['release', 'pickup', 'heat_wait']
const SECTION_VISIBILITY_KEYS = {
    groups: 'mainsail-toolchanger.groups-expanded',
    stats: 'mainsail-toolchanger.stats-expanded',
    offsets: 'mainsail-toolchanger.offsets-expanded',
}

@Component({
    components: { Panel, SpoolmanChangeSpoolDialog },
})
export default class ToolchangerPanel extends Mixins(BaseMixin) {
    mdiSwapHorizontal = mdiSwapHorizontal
    mdiChevronDown = mdiChevronDown
    mdiCog = mdiCog

    showSpoolDialog = false
    showSettingsDialog = false
    selectedSpoolTool: number | null = null
    progressPollTimer: number | null = null
    progressPollPending = false
    groupsExpanded = true
    statsExpanded = true
    offsetsExpanded = true

    get showPanel() {
        return this.klipperReadyForGui && 'multitool' in this.$store.state.printer
    }

    get multitool() {
        return this.$store.state.printer.multitool ?? {}
    }

    get multitoolFilament() {
        return this.$store.state.printer.multitool_filament ?? null
    }

    get multitoolStats(): ToolchangeStatsStatus | null {
        return (this.$store.state.printer.multitool_stats as ToolchangeStatsStatus | undefined) ?? null
    }

    get multitoolOffsets() {
        return this.$store.state.printer.multitool_offsets ?? null
    }

    get multitoolClamp() {
        return this.$store.state.printer.multitool_clamp ?? null
    }

    get saveVariables(): Record<string, unknown> {
        return this.$store.state.printer.save_variables?.variables ?? {}
    }

    get canSend(): boolean {
        const idleTimeout = this.$store.state.printer.idle_timeout?.state ?? ''

        return this.klipperReadyForGui && this.printer_state !== 'printing' && idleTimeout !== 'Printing'
    }

    get existsSpoolman() {
        return this.$store.state.server.components.includes('spoolman')
    }

    get currentTool() {
        return Number(this.multitool.current_tool ?? -1)
    }

    get spools(): ServerSpoolmanStateSpool[] {
        return this.$store.state.server.spoolman?.spools ?? []
    }

    get activeSpool(): ServerSpoolmanStateSpool | null {
        return this.$store.state.server.spoolman?.active_spool ?? null
    }

    get hasClamp() {
        return this.multitoolClamp !== null
    }

    get hasOffsets() {
        return this.multitoolOffsets !== null
    }

    get hasStats() {
        return this.multitoolStats !== null
    }

    get showStatusBar() {
        return this.hasClamp || this.hasOffsets
    }

    get isSwapActive() {
        return Boolean(this.multitool.active)
    }

    get statsCurrent(): ToolchangeCurrentStats {
        return this.multitoolStats?.tc_current ?? {}
    }

    get statsPrint(): ToolchangeStatsScope {
        return this.multitoolStats?.tc_print ?? {}
    }

    get statsTotal(): ToolchangeStatsScope {
        return this.multitoolStats?.tc_total ?? {}
    }

    get showSwapBanner() {
        return this.isSwapActive || Boolean(this.statsCurrent.active)
    }

    get swapSourceTool(): number | null {
        const tool = Number(this.multitool.change_from_tool ?? -1)

        return tool >= 0 ? tool : null
    }

    get swapDestinationTool(): number | null {
        const tool = Number(this.multitool.change_to_tool ?? -1)

        return tool >= 0 ? tool : null
    }

    get swapTargetTool(): number | null {
        if (this.activeStageKey === 'release') return this.swapSourceTool
        if (this.activeStageKey === 'pickup' || this.activeStageKey === 'heat_wait') return this.swapDestinationTool

        if (this.currentTool >= 0) return this.currentTool

        return this.swapDestinationTool
    }

    get runout() {
        return this.multitoolFilament?.runout ?? null
    }

    get showRunoutBanner() {
        return Boolean(this.runout?.active)
    }

    get runoutTool() {
        return Number(this.runout?.tool ?? this.currentTool)
    }

    get runoutContinueLength() {
        return Math.max(0, Number(this.runout?.continue_length ?? this.multitoolFilament?.runout_continue_length ?? 0))
    }

    get runoutRemaining() {
        return Math.max(0, Number(this.runout?.remaining_mm ?? 0))
    }

    get runoutProgress() {
        if (this.runoutContinueLength <= 0) return 100

        const consumed = Math.max(0, this.runoutContinueLength - this.runoutRemaining)

        return Math.min(100, Math.round((consumed / this.runoutContinueLength) * 100))
    }

    get runoutRemainingText() {
        return this.runoutRemaining.toFixed(1)
    }

    get runoutContinueLengthText() {
        return this.runoutContinueLength.toFixed(1)
    }

    get runoutNextTool() {
        return this.nextContinuationTool(this.runoutTool)
    }

    get clampState(): ClampState {
        const state = this.multitoolClamp?.state
        if (state === 'clamped' || state === 'released') return state

        return 'unknown'
    }

    get clampChipClass() {
        if (this.clampNeedsInitialization) return 'warn'
        if (this.clampState === 'clamped') return 'ok'
        if (this.clampState === 'released') return 'neutral'

        return 'warn'
    }

    get clampIcon() {
        return this.clampState === 'clamped' ? '■' : '□'
    }

    get clampText() {
        const suffix = this.clampNeedsInitialization
            ? this.$t('Panels.ToolchangerPanel.ClampUnseeded')
            : this.clampStateText

        return `${this.$t('Panels.ToolchangerPanel.Clamp')} ${suffix}`
    }

    get clampNeedsInitialization() {
        return this.clampState === 'unknown' || this.multitoolClamp?.seeded === true
    }

    get clampStateText() {
        const key = {
            clamped: 'ClampClamped',
            released: 'ClampReleased',
            unknown: 'ClampUnknown',
        }[this.clampState]

        return this.$t(`Panels.ToolchangerPanel.${key}`)
    }

    get offsetsAdaptive() {
        return Boolean(this.multitoolOffsets?.adaptive)
    }

    get appliedOffsetTool() {
        return Number(this.multitoolOffsets?.applied_tool ?? -1)
    }

    get offsetChipText() {
        if (this.appliedOffsetTool < 0)
            return `${this.$t('Panels.ToolchangerPanel.Offset')} ${this.$t('Panels.ToolchangerPanel.NoTool')}`

        return `${this.$t('Panels.ToolchangerPanel.Offset')} T${this.appliedOffsetTool} · X${this.formatOffset(
            this.multitoolOffsets?.applied_x
        )} Y${this.formatOffset(this.multitoolOffsets?.applied_y)} Z${this.formatOffset(this.multitoolOffsets?.applied_z)}`
    }

    get continuationGroups(): ContinuationGroup[] {
        const groups = this.multitoolFilament?.continuation_groups ?? []
        const out: ContinuationGroup[] = []

        groups.forEach((group: unknown, index: number) => {
            if (!Array.isArray(group) || group.length < 2) return

            const members = group.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
            if (members.length < 2) return

            out.push({ index, members, color: GROUP_COLORS[out.length % GROUP_COLORS.length] })
        })

        return out
    }

    get groupMarkers() {
        const markers: Record<number, GroupMarker> = {}
        this.continuationGroups.forEach((group, groupIndex) => {
            group.members.forEach((tool, order) => {
                markers[tool] = { group: groupIndex + 1, order: order + 1, color: group.color }
            })
        })

        return markers
    }

    get tools(): ToolchangerTool[] {
        const count = Number(this.multitool.tool_count ?? 0)
        const loaded = this.multitoolFilament?.loaded ?? []
        const spoolIds = this.multitool.spool_ids ?? []
        const assumeLoaded = this.multitoolFilament === null
        const tools = []

        for (let index = 0; index < count; index++) {
            const spoolId = Number(spoolIds[index] ?? 0)
            const spool = this.spoolForId(spoolId)
            const color = this.spoolColor(spool)

            tools.push({
                index,
                name: `T${index}`,
                loaded: assumeLoaded ? true : typeof loaded[index] === 'boolean' ? loaded[index] : null,
                spoolId,
                spool,
                color,
                percent: this.spoolPercent(spool),
                amountText: this.spoolAmountText(spool),
                isCurrent: this.currentTool === index,
            })
        }

        return tools
    }

    get displayTools(): ToolchangerTool[] {
        const tools = [...this.tools]

        return this.toolOrderDirection === 'right-to-left' ? tools.reverse() : tools
    }

    get toolOrderDirection(): ToolOrderDirection {
        const value = this.$store.state.gui.view.toolchanger?.toolOrderDirection

        return value === 'right-to-left' ? 'right-to-left' : 'left-to-right'
    }

    set toolOrderDirection(newVal: ToolOrderDirection) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.toolchanger.toolOrderDirection', value: newVal })
    }

    get toolsScrollKey() {
        return `${this.currentTool}:${this.tools.length}:${this.toolOrderDirection}`
    }

    get rackStyle() {
        return {
            '--tc-tool-count': Math.max(1, this.tools.length).toString(),
        }
    }

    get stageMeta() {
        return [
            {
                key: 'release' as ToolchangeStageKey,
                label: this.$t('Panels.ToolchangerPanel.StageRelease').toString(),
                color: '#4da6ff',
            },
            {
                key: 'pickup' as ToolchangeStageKey,
                label: this.$t('Panels.ToolchangerPanel.StagePickup').toString(),
                color: '#2bd46a',
            },
            {
                key: 'heat_wait' as ToolchangeStageKey,
                label: this.$t('Panels.ToolchangerPanel.StageHeatWait').toString(),
                color: '#ff9f43',
            },
        ]
    }

    get activeStageKey(): ToolchangeStageKey | null {
        const stage = this.statsCurrent.active_stage ?? null

        return stage !== null && STAGE_KEYS.includes(stage) ? stage : null
    }

    get stageSteps() {
        const activeKey = this.activeStageKey
        const activeIndex = activeKey ? STAGE_KEYS.indexOf(activeKey) : -1
        const stages = this.statsCurrent.stages ?? {}

        return this.stageMeta.map((stage, index) => ({
            ...stage,
            seconds: Number(stages[stage.key] ?? 0),
            state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending',
        }))
    }

    get statsCards() {
        const printCount = Number(this.statsPrint.count ?? 0)
        const printElapsed = Number(this.statsPrint.elapsed ?? 0)
        const totalCount = Number(this.statsTotal.count ?? 0)
        const totalElapsed = Number(this.statsTotal.elapsed ?? 0)
        const avg = printCount > 0 ? printElapsed / printCount : 0

        return [
            {
                label: this.$t('Panels.ToolchangerPanel.StatsPrintCount').toString(),
                value: printCount,
                unit: this.$t('Panels.ToolchangerPanel.CountUnit').toString(),
            },
            {
                label: this.$t('Panels.ToolchangerPanel.StatsPrintElapsed').toString(),
                value: this.formatDuration(printElapsed),
                unit: '',
            },
            {
                label: this.$t('Panels.ToolchangerPanel.StatsAverage').toString(),
                value: this.formatDuration(avg),
                unit: '',
            },
            {
                label: this.$t('Panels.ToolchangerPanel.StatsTotalCount').toString(),
                value: totalCount,
                unit: this.$t('Panels.ToolchangerPanel.CountUnit').toString(),
            },
            {
                label: this.$t('Panels.ToolchangerPanel.StatsTotalElapsed').toString(),
                value: this.formatDuration(totalElapsed),
                unit: '',
            },
        ]
    }

    get statsAverageCard() {
        return this.statsCards[2]
    }

    get statsSecondaryCards() {
        const cards = this.statsCards

        return [cards[0], cards[1], cards[3], cards[4]]
    }

    get stageBreakdown() {
        const stages = this.statsPrint.stages ?? {}
        const total = STAGE_KEYS.reduce((sum, key) => sum + Number(stages[key] ?? 0), 0) || 1

        return this.stageMeta.map((stage) => {
            const seconds = Number(stages[stage.key] ?? 0)

            return {
                ...stage,
                seconds,
                percent: Math.round((seconds / total) * 100),
            }
        })
    }

    get showOffsetTable() {
        return this.hasOffsets && this.tools.length > 0
    }

    get offsetCells(): OffsetCell[] {
        const calibrationBaseTool = 0

        return this.tools.map((tool) => {
            const offset = this.offsetForTool(tool.index)
            const isCalibrationBase = tool.index === calibrationBaseTool

            return {
                tool: tool.index,
                x: offset.x,
                y: offset.y,
                z: offset.z,
                base: isCalibrationBase,
                current: tool.index === this.currentTool,
                calibrated: isCalibrationBase || offset.x !== 0 || offset.y !== 0 || offset.z !== 0,
            }
        })
    }

    spoolForId(spoolId: number) {
        if (spoolId <= 0) return null
        if (this.activeSpool?.id === spoolId) return this.activeSpool

        return this.spools.find((entry) => entry.id === spoolId) ?? null
    }

    spoolColor(spool: ServerSpoolmanStateSpool | null) {
        const color = spool?.filament?.color_hex ?? null
        if (!color) return '#8d8d8d'

        return `#${color.replace('#', '')}`
    }

    spoolPercent(spool: ServerSpoolmanStateSpool | null) {
        if (!spool) return null

        const remaining = spool.remaining_weight ?? null
        const total = spool.initial_weight ?? spool.filament?.weight ?? null
        if (remaining === null || total === null || total <= 0) return null

        return Math.ceil(Math.max(0, Math.min(100, (remaining / total) * 100)))
    }

    spoolAmountText(spool: ServerSpoolmanStateSpool | null) {
        if (!spool) return this.$t('Panels.SpoolmanPanel.NoSpool').toString()

        const output = []
        const remainingWeight = spool.remaining_weight ?? null
        const totalWeight = spool.initial_weight ?? spool.filament?.weight ?? null
        if (remainingWeight !== null && totalWeight !== null) {
            output.push(`${Math.round(remainingWeight)}g / ${Math.round(totalWeight)}g`)
        }

        const remainingLength = spool.remaining_length ?? null
        if (remainingLength !== null) output.push(`${Math.round(remainingLength / 1000)}m`)

        return output.join(' | ') || this.$t('Panels.ToolchangerPanel.UnknownRemaining').toString()
    }

    spoolStyle(tool: ToolchangerTool) {
        const filamentColor = tool.loaded === false || this.isUnknownTool(tool) ? '#000000' : tool.color
        const pctColors = this.percentColors(filamentColor)

        return {
            '--filament-color': filamentColor,
            '--pct-fill': pctColors.fill,
            '--pct-stroke': pctColors.stroke,
        }
    }

    filamentTransform(tool: ToolchangerTool) {
        const scaleXStart = 0.28
        const scaleXEnd = 0.4
        const scaleYStart = 1.65
        const scaleYEnd = 3.5
        const clampedAmount = Math.max(0, Math.min(100, tool.percent ?? 0))
        const scaleX = scaleXStart + (scaleXEnd - scaleXStart) * (clampedAmount / 100)
        const scaleY = scaleYStart + (scaleYEnd - scaleYStart) * (clampedAmount / 100)

        return `matrix(${scaleX},0,0,${scaleY},197,250)`
    }

    percentText(tool: ToolchangerTool) {
        if (tool.percent === null) return '--'

        return `${tool.percent}%`
    }

    parseColor(hex: string): RgbColor | null {
        let value = hex.trim().replace(/^#/, '')
        if (/^[0-9a-fA-F]{3}$/.test(value)) {
            value = value
                .split('')
                .map((char) => char + char)
                .join('')
        }
        if (!/^[0-9a-fA-F]{6}$/.test(value)) return null

        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16),
        }
    }

    relativeLuminance(hex: string): number | null {
        const rgb = this.parseColor(hex)
        if (!rgb) return null

        const channel = (color: number) => {
            const scaled = color / 255

            return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
        }

        return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
    }

    percentColors(hex: string) {
        const luminance = this.relativeLuminance(hex)
        if (luminance !== null && luminance > 0.55) {
            return { fill: '#1a1a1a', stroke: 'rgba(255, 255, 255, 0.75)' }
        }

        return { fill: '#ffffff', stroke: 'rgba(0, 0, 0, 0.55)' }
    }

    isUnknownTool(tool: ToolchangerTool) {
        return tool.loaded === null
    }

    drawFilament(tool: ToolchangerTool) {
        return tool.loaded !== false && !this.isUnknownTool(tool)
    }

    channelClasses(tool: ToolchangerTool) {
        return {
            empty: tool.loaded === false,
            unknown: this.isUnknownTool(tool),
        }
    }

    spoolButtonClasses(tool: ToolchangerTool) {
        return {
            active: tool.isCurrent,
            empty: tool.loaded === false,
            unknown: this.isUnknownTool(tool),
            'swap-target': this.isSwapTarget(tool),
            runout: this.isRunoutTool(tool),
        }
    }

    isSwapTarget(tool: ToolchangerTool) {
        return this.showSwapBanner && this.swapTargetTool === tool.index
    }

    isRunoutTool(tool: ToolchangerTool) {
        return this.showRunoutBanner && this.runoutTool === tool.index
    }

    groupMarker(tool: ToolchangerTool) {
        return this.groupMarkers[tool.index] ?? null
    }

    groupMarkerTitle(tool: ToolchangerTool) {
        const marker = this.groupMarker(tool)
        if (!marker) return ''

        return this.$t('Panels.ToolchangerPanel.GroupDotTitle', { group: marker.group, order: marker.order }).toString()
    }

    toolButtonTitle(tool: ToolchangerTool) {
        const key = tool.isCurrent ? 'ReleaseTool' : 'SwitchTool'

        return this.$t('Panels.ToolchangerPanel.' + key, { tool: tool.name }).toString()
    }

    spoolAriaLabel(tool: ToolchangerTool) {
        const lines = [tool.name]
        if (tool.loaded === false) lines.push(this.$t('Panels.ToolchangerPanel.Unloaded').toString())
        else if (this.isUnknownTool(tool)) lines.push(this.$t('Panels.ToolchangerPanel.UnknownLoaded').toString())
        else if (tool.percent !== null) lines.push(this.percentText(tool))

        return lines.join(', ')
    }

    tooltipText(tool: ToolchangerTool) {
        const lines = [tool.name]
        if (tool.spool) {
            lines.push(`#${tool.spoolId} ${tool.spool.filament?.vendor?.name ?? ''}`.trim())
            lines.push(tool.spool.filament?.name ?? this.$t('Panels.ToolchangerPanel.UnknownFilament').toString())
            lines.push(tool.spool.filament?.material ?? this.$t('Panels.ToolchangerPanel.UnknownMaterial').toString())
            lines.push(tool.amountText)
        } else if (tool.spoolId) {
            lines.push(this.$t('Panels.ToolchangerPanel.MissingSpool', { id: tool.spoolId }).toString())
        } else {
            lines.push(this.$t('Panels.SpoolmanPanel.NoSpool').toString())
        }

        if (tool.loaded === true) lines.push(this.$t('Panels.ToolchangerPanel.Loaded').toString())
        else if (tool.loaded === false) lines.push(this.$t('Panels.ToolchangerPanel.Unloaded').toString())
        else lines.push(this.$t('Panels.ToolchangerPanel.UnknownLoaded').toString())

        return lines.join('\n')
    }

    stageMark(stage: { state: string }, index: number) {
        return stage.state === 'done' ? '✓' : index + 1
    }

    formatDuration(seconds: unknown) {
        const value = Math.max(0, Number(seconds) || 0)
        if (value < 60) return `${value.toFixed(1)}s`
        if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`

        return `${Math.floor(value / 3600)}h ${Math.round((value % 3600) / 60)}m`
    }

    formatOffset(value: unknown) {
        const num = Number(value ?? 0)

        return Number.isFinite(num) ? num.toFixed(2) : '0.00'
    }

    offsetForTool(tool: number) {
        return {
            x: this.numberVariable(`t${tool}_offset_x`),
            y: this.numberVariable(`t${tool}_offset_y`),
            z: this.numberVariable(`t${tool}_offset_z`),
        }
    }

    numberVariable(key: string) {
        const value = Number(this.saveVariables[key] ?? 0)

        return Number.isFinite(value) ? value : 0
    }

    nextContinuationTool(tool: number) {
        for (const group of this.continuationGroups) {
            const index = group.members.indexOf(tool)
            if (index !== -1 && group.members.length > 1) return group.members[(index + 1) % group.members.length]
        }

        return null
    }

    openSpoolDialog(tool: number) {
        if (!this.existsSpoolman) return

        this.selectedSpoolTool = tool
        this.showSpoolDialog = true
    }

    setToolSpool(spool: ServerSpoolmanStateSpool) {
        if (this.selectedSpoolTool === null) return

        this.sendGcode(`SET_TOOL_SPOOL_ID TOOL=${this.selectedSpoolTool} SPOOL_ID=${spool.id}`, 'set_tool_spool_id')
        this.selectedSpoolTool = null
    }

    selectTool(tool: number) {
        if (tool === this.currentTool) {
            this.sendGcode('UNTOOL', 'toolchanger_untool')

            return
        }

        this.sendGcode('T' + tool, 'toolchanger_t' + tool)
    }

    sendGcode(gcode: string, loading: string | null = null) {
        this.$store.dispatch('server/addEvent', { message: gcode, type: 'command' })
        this.$socket.emit('printer.gcode.script', { script: gcode }, { loading })
    }

    readPersistentSection(section: keyof typeof SECTION_VISIBILITY_KEYS) {
        try {
            const value = window.localStorage.getItem(SECTION_VISIBILITY_KEYS[section])

            return value === null ? true : value === 'true'
        } catch {
            return true
        }
    }

    writePersistentSection(section: keyof typeof SECTION_VISIBILITY_KEYS, value: boolean) {
        try {
            window.localStorage.setItem(SECTION_VISIBILITY_KEYS[section], value.toString())
        } catch {
            // Ignore storage failures; the current session state still updates.
        }
    }

    togglePersistentSection(section: keyof typeof SECTION_VISIBILITY_KEYS) {
        if (section === 'groups') {
            this.groupsExpanded = !this.groupsExpanded
            this.writePersistentSection(section, this.groupsExpanded)
        } else if (section === 'stats') {
            this.statsExpanded = !this.statsExpanded
            this.writePersistentSection(section, this.statsExpanded)
        } else {
            this.offsetsExpanded = !this.offsetsExpanded
            this.writePersistentSection(section, this.offsetsExpanded)
        }
    }

    refElement(ref: Vue | Element | Array<Vue | Element> | undefined): HTMLElement | null {
        const entry = Array.isArray(ref) ? ref[0] : ref
        if (entry instanceof HTMLElement) return entry
        if (entry instanceof Vue && entry.$el instanceof HTMLElement) return entry.$el

        return null
    }

    async refreshProgressObjects() {
        if (this.progressPollPending) return

        const objects: Record<string, null> = {}
        if (this.showSwapBanner || this.hasStats) objects.multitool_stats = null
        if (this.showRunoutBanner) objects.multitool_filament = null
        if (!Object.keys(objects).length) return

        this.progressPollPending = true
        try {
            const result = await this.$socket.emitAndWait('printer.objects.query', { objects }, {})
            await this.$store.dispatch('printer/getData', result)
        } catch (error) {
            window.console.debug('toolchanger progress refresh failed', error)
        } finally {
            this.progressPollPending = false
        }
    }

    updateProgressPolling() {
        const shouldPoll = this.showSwapBanner || this.showRunoutBanner

        if (shouldPoll && this.progressPollTimer === null) {
            this.refreshProgressObjects()
            this.progressPollTimer = window.setInterval(() => this.refreshProgressObjects(), 500)
        } else if (!shouldPoll && this.progressPollTimer !== null) {
            window.clearInterval(this.progressPollTimer)
            this.progressPollTimer = null
        }
    }

    mounted() {
        this.groupsExpanded = this.readPersistentSection('groups')
        this.statsExpanded = this.readPersistentSection('stats')
        this.offsetsExpanded = this.readPersistentSection('offsets')
        this.scrollCurrentToolIntoView()
        this.updateProgressPolling()
    }

    beforeDestroy() {
        if (this.progressPollTimer !== null) window.clearInterval(this.progressPollTimer)
    }

    @Watch('showSwapBanner')
    @Watch('showRunoutBanner')
    onProgressBannerChanged() {
        this.updateProgressPolling()
    }

    @Watch('toolsScrollKey')
    scrollCurrentToolIntoView() {
        this.$nextTick(() => {
            const scroller = this.refElement(this.$refs.toolchangerCard as Vue | Element | undefined)
            const button = this.refElement(
                this.$refs[`spoolButton${this.currentTool}`] as Vue | Element | Array<Vue | Element> | undefined
            )

            if (!scroller || !button) return
            if (scroller.scrollWidth <= scroller.clientWidth) return

            const scrollerRect = scroller.getBoundingClientRect()
            const buttonRect = button.getBoundingClientRect()
            const delta = buttonRect.left + buttonRect.width / 2 - (scrollerRect.left + scrollerRect.width / 2)

            scroller.scrollLeft += delta
        })
    }
}
</script>

<style scoped>
.toolchanger-card {
    --tc-rack-padding-x: clamp(10px, 4cqw, 18px);
    --tc-channel-width: clamp(34px, calc((100cqw - (var(--tc-rack-padding-x) * 2)) / var(--tc-tool-count)), 46px);
    --tc-spool-width: clamp(40px, calc(var(--tc-channel-width) + 6px), 52px);
    --tc-spool-height: calc(var(--tc-spool-width) * 1.8846);

    container-type: inline-size;
    overflow-x: auto;
    padding: clamp(16px, 4cqw, 24px) clamp(12px, 4cqw, 20px) clamp(20px, 5cqw, 28px);
    scroll-behavior: smooth;
}

.toolchanger-rack {
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 12%),
        linear-gradient(180deg, #2a2f37 0%, #15181d 10%, #1b1f25 72%, #2c323b 73%, #20242b 100%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 22px 22px 12px 12px;
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        inset 0 -2px 6px rgba(0, 0, 0, 0.7),
        0 12px 32px -18px rgba(0, 0, 0, 0.85);
    display: inline-block;
    min-width: 100%;
    padding: clamp(12px, 4cqw, 16px) var(--tc-rack-padding-x) 12px;
}

.rack-inner {
    display: flex;
    flex-direction: column;
    min-width: 100%;
    position: relative;
}

.toolchanger-spools {
    align-items: flex-end;
    display: flex;
    gap: 0;
    justify-content: safe center;
    min-height: calc(var(--tc-spool-height) + 30px);
    padding-top: 10px;
}

.toolchanger-channel {
    align-items: center;
    display: flex;
    flex: 0 0 var(--tc-channel-width);
    flex-direction: column;
}

.spool-button {
    background: transparent;
    border: 0;
    cursor: pointer;
    height: var(--tc-spool-height);
    margin-bottom: -8px;
    outline: none;
    padding: 0;
    position: relative;
    transition:
        filter 0.2s,
        transform 0.2s;
    width: var(--tc-spool-width);
    z-index: 1;
}

.spool-button:hover {
    filter: brightness(1.08);
    transform: translateY(-2px);
}

.spool-button.active {
    filter: drop-shadow(0 0 7px rgba(43, 212, 106, 0.45));
    transform: translateY(-6px) scale(1.08);
    z-index: 2;
}

.spool-button.active:hover {
    filter: brightness(1.08) drop-shadow(0 0 7px rgba(43, 212, 106, 0.45));
    transform: translateY(-6px) scale(1.08);
}

.spool-svg {
    display: block;
    height: var(--tc-spool-height);
    overflow: visible;
    width: var(--tc-spool-width);
}

.spool-wheel {
    fill: #ad8762;
    filter: drop-shadow(4px 0 3px rgba(0, 0, 0, 0.65));
}

.spool-filament {
    fill: var(--filament-color);
    filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.35));
}

.spool-button.empty .spool-filament {
    fill: #000000;
}

.spool-button.empty .spool-wheel {
    fill: #595959;
    filter: drop-shadow(4px 0 3px rgba(0, 0, 0, 0.45)) saturate(0.4);
    opacity: 0.65;
}

.spool-empty-label {
    fill: #d0d0d0;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.5);
    stroke-width: 5px;
}

.spool-button.unknown .spool-wheel {
    filter: drop-shadow(4px 0 3px rgba(0, 0, 0, 0.45)) saturate(0.5);
    opacity: 0.8;
}

.spool-unknown-label {
    fill: #f4c542;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 5px;
}

.spool-percent-svg {
    fill: var(--pct-fill, #fff);
    paint-order: stroke;
    stroke: var(--pct-stroke, rgba(0, 0, 0, 0.35));
    stroke-width: 5px;
}

.spool-button:focus-visible,
.channel-button:focus-visible {
    outline: 2px solid #4da6ff;
    outline-offset: 2px;
}

.toolchanger-channel-box {
    align-items: center;
    background-image: linear-gradient(to bottom, #363b43 0%, #23272e 100%);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.14),
        inset 0 -1px 0 rgba(0, 0, 0, 0.45);
    display: flex;
    justify-content: center;
    padding: 9px 0 6px;
    position: relative;
    width: 100%;
    z-index: 3;
}

.toolchanger-channel-box.first {
    border-radius: 10px 0 0 10px;
}

.toolchanger-channel-box.last {
    border-radius: 0 10px 10px 0;
}

.toolchanger-channel-box.first.last {
    border-radius: 10px;
}

.channel-button {
    background: #20242b;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    color: #cdd3da;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    height: clamp(20px, calc(var(--tc-channel-width) * 0.48), 22px);
    line-height: 1;
    min-width: min(34px, 100%);
    outline: none;
    text-align: center;
    transition:
        background 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease,
        box-shadow 0.18s ease;
    width: min(82%, calc(var(--tc-channel-width) - 8px));
}

.channel-button:hover {
    background: #2a2f37;
    border-color: rgba(255, 255, 255, 0.16);
}

.channel-button.active {
    background: #2bd46a;
    border-color: #2bd46a;
    box-shadow:
        0 0 0 1px #2bd46a,
        0 6px 14px -6px rgba(43, 212, 106, 0.45);
    color: #04210f;
}

.toolchanger-channel.empty .channel-button {
    border-style: dashed;
    color: #8a8a8a;
    opacity: 0.7;
}

.toolchanger-channel.unknown .channel-button {
    border-style: dotted;
    color: #e0b743;
}

.toolchanger-spools.busy .spool-button:not(.swap-target):not(.active) {
    filter: grayscale(0.35) brightness(0.6);
    opacity: 0.55;
}

.spool-button.swap-target {
    animation: swapPulse 1.1s ease-in-out infinite;
    z-index: 2;
}

@keyframes swapPulse {
    0%,
    100% {
        filter: drop-shadow(0 0 4px rgba(43, 212, 106, 0.45));
        transform: translateY(-4px) scale(1.04);
    }

    50% {
        filter: drop-shadow(0 0 12px #2bd46a);
        transform: translateY(-8px) scale(1.1);
    }
}

.spool-button.runout {
    animation: runoutPulse 1s ease-in-out infinite;
    z-index: 2;
}

@keyframes runoutPulse {
    0%,
    100% {
        filter: drop-shadow(0 0 3px rgba(255, 159, 67, 0.5));
    }

    50% {
        filter: drop-shadow(0 0 12px rgba(255, 159, 67, 0.95));
    }
}

.channel-button:disabled {
    cursor: default;
}

.status-bar {
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 24px;
}

.chip {
    align-items: center;
    background: #20242b;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    color: #98a2ad;
    display: inline-flex;
    font-size: 12.5px;
    font-weight: 600;
    gap: 6px;
    letter-spacing: 0.01em;
    padding: 5px 12px;
    white-space: nowrap;
}

.chip-icon {
    font-size: 13px;
}

.chip.ok {
    border-color: rgba(43, 212, 106, 0.4);
    color: #6ee79b;
}

.chip.neutral {
    color: #c4ccd4;
}

.chip.warn {
    border-color: rgba(255, 159, 67, 0.45);
    color: #ffb86b;
}

.chip-tag {
    background: rgba(77, 166, 255, 0.16);
    border-radius: 6px;
    color: #7cc0ff;
    font-size: 11px;
    margin-left: 2px;
    padding: 1px 6px;
}

.banner {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 24px;
}

.swap-banner {
    background: linear-gradient(180deg, rgba(43, 212, 106, 0.12), rgba(43, 212, 106, 0.03));
}

.runout-banner {
    background: linear-gradient(180deg, rgba(255, 159, 67, 0.14), rgba(255, 159, 67, 0.03));
}

.banner-head {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 14px;
    gap: 10px;
}

.banner-route {
    color: currentColor;
    font-weight: 700;
}

.route-arrow {
    color: #2bd46a;
    margin: 0 2px;
}

.runout-banner .route-arrow {
    color: #ff9f43;
}

.banner-elapsed {
    color: #98a2ad;
    font-size: 13px;
    margin-left: auto;
}

.banner-spinner {
    animation: spin 0.9s linear infinite;
    border: 2px solid rgba(43, 212, 106, 0.25);
    border-radius: 50%;
    border-top-color: #2bd46a;
    height: 15px;
    width: 15px;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.banner-warn-icon {
    align-items: center;
    color: #ff9f43;
    display: inline-flex;
    font-size: 16px;
    font-weight: 800;
    justify-content: center;
}

.stage-track {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.stage-step {
    align-items: center;
    color: #98a2ad;
    display: inline-flex;
    font-size: 13px;
    font-weight: 600;
    gap: 6px;
}

.stage-dot {
    align-items: center;
    background: #2a2f37;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 50%;
    color: #98a2ad;
    display: inline-flex;
    font-size: 11px;
    height: 20px;
    justify-content: center;
    width: 20px;
}

.stage-step.done {
    color: currentColor;
}

.stage-step.done .stage-dot {
    background: #2bd46a;
    border-color: #2bd46a;
    color: #04210f;
}

.stage-step.active {
    color: currentColor;
}

.stage-step.active .stage-dot {
    animation: stageDot 1.1s ease-in-out infinite;
    background: #2bd46a;
    border-color: #2bd46a;
    color: #04210f;
}

@keyframes stageDot {
    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(43, 212, 106, 0.45);
    }

    50% {
        box-shadow: 0 0 0 5px rgba(43, 212, 106, 0);
    }
}

.stage-time {
    color: #98a2ad;
    font-size: 11.5px;
    font-weight: 500;
}

.stage-sep {
    background: rgba(255, 255, 255, 0.08);
    flex: 0 0 16px;
    height: 1px;
    margin: 0 2px;
}

.runout-bar {
    background: rgba(0, 0, 0, 0.4);
    border-radius: 999px;
    height: 8px;
    overflow: hidden;
}

.runout-bar span {
    background: linear-gradient(90deg, #ff9f43, #ff7a2f);
    border-radius: 999px;
    display: block;
    height: 100%;
    transition: width 0.3s ease;
}

.group-marker {
    align-items: center;
    display: flex;
    height: 12px;
    justify-content: center;
    margin-top: 5px;
}

.group-dot {
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    height: 9px;
    width: 9px;
}

.group-panel,
.collapsible-section {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.group-panel,
.stats-panel,
.offset-table {
    padding: 20px 24px;
}

.settings-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.settings-title {
    color: currentColor;
    font-size: 14px;
    font-weight: 600;
}

.stats-panel {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.section-toggle {
    align-items: center;
    background: transparent;
    border: 0;
    color: #98a2ad;
    cursor: pointer;
    display: flex;
    font-size: 11.5px;
    font-weight: 650;
    gap: 6px;
    justify-content: space-between;
    letter-spacing: 0.02em;
    line-height: 1.2;
    padding: 7px 14px;
    text-align: left;
    width: 100%;
}

.section-toggle:hover {
    background: rgba(255, 255, 255, 0.03);
    color: currentColor;
}

.section-toggle-icon {
    color: currentColor;
    transition: transform 0.18s ease;
}

.section-toggle-icon.collapsed {
    transform: rotate(-90deg);
}

.group-rows {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.group-row {
    align-items: center;
    background: #20242b;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    display: flex;
    gap: 10px;
    padding: 10px 14px;
}

.grp-swatch {
    border-radius: 4px;
    flex: 0 0 auto;
    height: 14px;
    width: 14px;
}

.grp-name {
    color: #98a2ad;
    font-size: 12.5px;
    font-weight: 600;
}

.grp-route {
    color: currentColor;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.01em;
}

.grp-arrow {
    color: #98a2ad;
    font-weight: 400;
    margin: 0 2px;
}

.stats-overview {
    align-items: stretch;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    display: grid;
    gap: 1px;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    overflow: hidden;
    padding: 1px;
}

.stat-primary {
    background: linear-gradient(180deg, rgba(43, 212, 106, 0.12), rgba(43, 212, 106, 0.04)), #20242b;
}

.stat-metrics {
    display: contents;
}

.stat-primary,
.stat-metric {
    background: #20242b;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    min-height: 58px;
    padding: 9px 11px;
}

.stat-metric:hover {
    background: rgba(255, 255, 255, 0.03);
}

.stat-value {
    color: currentColor;
    font-size: clamp(15px, 3.2cqw, 18px);
    font-weight: 700;
    line-height: 1.15;
    overflow-wrap: anywhere;
}

.stat-primary .stat-value {
    color: #6ee79b;
    font-size: clamp(17px, 3.8cqw, 22px);
}

.stat-unit {
    color: #98a2ad;
    font-size: clamp(10.5px, 2.2cqw, 12px);
    font-weight: 600;
    margin-left: 3px;
}

.stat-label {
    color: #98a2ad;
    font-size: clamp(10.5px, 2.3cqw, 11.5px);
    font-weight: 600;
    margin-bottom: 3px;
    overflow-wrap: anywhere;
}

@container (max-width: 560px) {
    .stats-overview {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stat-primary {
        grid-column: 1 / -1;
    }

    .stat-primary .stat-label {
        margin-bottom: 0;
    }
}

@container (max-width: 300px) {
    .stats-overview {
        grid-template-columns: 1fr;
    }
}

.stage-breakdown-title,
.section-title {
    color: #98a2ad;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin-bottom: 10px;
}

.stage-bar {
    background: rgba(0, 0, 0, 0.35);
    border-radius: 8px;
    display: flex;
    height: 16px;
    overflow: hidden;
}

.stage-seg {
    display: block;
    height: 100%;
}

.stage-seg + .stage-seg {
    box-shadow: inset 1px 0 0 rgba(0, 0, 0, 0.3);
}

.stage-legends {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 10px;
}

.stage-legend {
    align-items: center;
    color: currentColor;
    display: inline-flex;
    font-size: 12.5px;
    gap: 6px;
}

.legend-dot {
    border-radius: 3px;
    height: 11px;
    width: 11px;
}

.legend-pct {
    color: #98a2ad;
}

.off-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}

.off-cell {
    background: #20242b;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px 12px;
}

.off-cell.current {
    border-color: #2bd46a;
    box-shadow: 0 0 0 1px #2bd46a;
}

.off-cell.uncal {
    opacity: 0.55;
}

.off-head {
    align-items: center;
    color: currentColor;
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    font-weight: 700;
    gap: 6px;
    margin-bottom: 8px;
}

.off-tag {
    border-radius: 5px;
    font-size: 10.5px;
    font-weight: 600;
    padding: 1px 6px;
}

.off-tag.base {
    background: rgba(77, 166, 255, 0.18);
    color: #7cc0ff;
}

.off-tag.current {
    background: rgba(43, 212, 106, 0.18);
    color: #6ee79b;
}

.off-tag.none {
    background: rgba(255, 255, 255, 0.08);
    color: #98a2ad;
}

.off-vals {
    color: #98a2ad;
    display: flex;
    font-size: 11.5px;
    gap: 8px;
}

.off-vals b {
    color: currentColor;
    font-weight: 600;
}

.white-space-pre-line {
    white-space: pre-line;
}

@media (max-width: 600px) {
    .toolchanger-rack {
        padding-left: 16px;
        padding-right: 16px;
    }

    .toolchanger-spools {
        justify-content: flex-start;
    }

    .banner-elapsed {
        margin-left: 0;
    }
}
</style>
