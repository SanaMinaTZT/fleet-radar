
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDispatchBannerHtml(lastDispatch) {
  if (!lastDispatch) return '';
  const isAutoSplit = lastDispatch.flags?.autoSplit;
  const isSelfTest = lastDispatch.flags?.selfTest;
  const isSmartNew = lastDispatch.flags?.smartNew;
  const isOverdraftProtect = lastDispatch.flags?.overdraftProtect;
  const reviewClient = lastDispatch.flags?.reviewClient;
  const scaleTier = lastDispatch.scaleTier || 'Tier S/M';
  const tierClass = scaleTier.includes('L/XL') ? 'badge-tier-large' : 'badge-tier-small';
  const timeStr = lastDispatch.timestamp ? new Date(lastDispatch.timestamp).toLocaleTimeString() : '';

  let badgesHtml = '';
  if (isSelfTest) {
    badgesHtml += '<span class="badge badge-selftest" title="自动化单元测试与质量验证门禁强制开启">🧪 强制自测闭环 (SelfTest: ON)</span>';
  }
  if (isSmartNew) {
    const reasonTip = lastDispatch.smartNewReason ? `原因: ${escapeHtml(lastDispatch.smartNewReason)}` : '新话题/旧会话超载时自动开新窗';
    badgesHtml += `<span class="badge badge-smartnew" title="${reasonTip}">🧠 智能新窗 (SmartNew: ON)</span>`;
  }
  if (isAutoSplit) {
    const splitTip = lastDispatch.scaleReason ? `依据: ${escapeHtml(lastDispatch.scaleReason)}` : '大型多模块自动正交拆分';
    badgesHtml += `<span class="badge badge-autosplit" title="${splitTip}">📐 智能拆分 (AutoSplit: ON)</span>`;
  }
  if (isOverdraftProtect === false) {
    badgesHtml += '<span class="badge badge-warning" title="周透支节点保护已关闭，允许满血调动">⚡ 透支放开 (Overdraft: OFF)</span>';
  } else if (isOverdraftProtect === true) {
    badgesHtml += '<span class="badge badge-shield" title="周透支节点保护已开启">🛡️ 透支保护 (Overdraft: ON)</span>';
  }
  if (reviewClient) {
    badgesHtml += `<span class="badge badge-review" title="指定交叉代码审查节点">👥 交叉审查 (Review: ${escapeHtml(reviewClient)})</span>`;
  }

  const promptPreview = lastDispatch.promptPreview ? `<div class="banner-prompt-preview">“${escapeHtml(lastDispatch.promptPreview)}”</div>` : '';

  return `
    <div class="live-dispatch-inner">
      <div class="banner-header-row">
        <div class="banner-title-group">
          <span class="status-dot live"></span>
          <strong class="banner-title">📡 实时调度状态与门禁回馈 (Live Dispatch & Gate Feedback)</strong>
          <span class="banner-time">${timeStr}</span>
        </div>
        <div class="banner-badges-group">
          <span class="badge ${tierClass}">${scaleTier}</span>
          ${badgesHtml}
        </div>
      </div>
      <div class="banner-body-row">
        <div class="dispatch-detail-item">
          <span class="detail-label">调度目标：</span>
          <strong class="target-name highlight-blue">${escapeHtml(lastDispatch.targetName || lastDispatch.targetId)}</strong>
          ${lastDispatch.reusedChat ? '<span class="badge-reused">复用已有会话</span>' : '<span class="badge-newchat">全新会话窗口</span>'}
        </div>
        <div class="dispatch-detail-item">
          <span class="detail-label">来源触发：</span>
          <span class="detail-val">${lastDispatch.source === 'chat_agent' ? '0号主控对话终端' : 'Radar 面板派发'}</span>
        </div>
        ${lastDispatch.subCascadeId ? `
        <div class="dispatch-detail-item">
          <span class="detail-label">子会话 ID：</span>
          <code class="cid-code" title="${lastDispatch.subCascadeId}">${lastDispatch.subCascadeId.substring(0, 12)}...</code>
        </div>` : ''}
      </div>
      ${promptPreview}
    </div>
  `;
}

let lastSyncedFlagsTimestamp = null;
let lastUserFlagInteractionMs = 0;

function showFlagsSyncBadge(text) {
  let badge = $('flags-sync-badge');
  if (!badge) {
    const row = document.querySelector('.form-options-row');
    if (row) {
      badge = document.createElement('span');
      badge.id = 'flags-sync-badge';
      badge.style.cssText = 'font-size:11px;font-weight:600;color:#58a6ff;margin-left:10px;padding:2px 8px;background:rgba(56,139,253,0.15);border:1px solid rgba(56,139,253,0.3);border-radius:4px;transition:opacity 0.3s;display:inline-block;';
      row.appendChild(badge);
    }
  }
  if (badge) {
    badge.textContent = text;
    badge.style.opacity = '1';
    setTimeout(() => { if (badge) badge.style.opacity = '0'; }, 2500);
  }
}

function syncDispatchFlagsFromState(activeFlags, force = false) {
  if (!activeFlags) return;
  const activeEl = document.activeElement;
  if (!force && activeEl && activeEl.closest('.form-options-row')) {
    return;
  }

  const forceNewEl = $('dispatch-opt-force-new');
  const smartNewEl = $('smartNew');
  const autoSplitEl = $('autoSplit');
  const overdraftProtectEl = $('overdraftProtect');
  const selfTestEl = $('dispatch-opt-self-test');
  const peerReviewEl = $('dispatch-opt-peer-review');

  if (forceNewEl && typeof activeFlags.forceNew === 'boolean') forceNewEl.checked = activeFlags.forceNew;
  if (smartNewEl && typeof activeFlags.smartNew === 'boolean') smartNewEl.checked = activeFlags.smartNew;
  if (autoSplitEl && typeof activeFlags.autoSplit === 'boolean') autoSplitEl.checked = activeFlags.autoSplit;
  if (overdraftProtectEl && typeof activeFlags.overdraftProtect === 'boolean') overdraftProtectEl.checked = activeFlags.overdraftProtect;
  if (selfTestEl && typeof activeFlags.selfTest === 'boolean') selfTestEl.checked = activeFlags.selfTest;
  if (peerReviewEl && typeof activeFlags.reviewClient !== 'undefined') {
    peerReviewEl.checked = Boolean(activeFlags.reviewClient);
  }
}

async function pushActiveFlagsToServer() {
  lastUserFlagInteractionMs = Date.now();
  const flags = {
    forceNew: $('dispatch-opt-force-new')?.checked || false,
    smartNew: $('smartNew')?.checked || false,
    autoSplit: $('autoSplit')?.checked || false,
    overdraftProtect: $('overdraftProtect') ? $('overdraftProtect').checked : true,
    selfTest: $('dispatch-opt-self-test')?.checked || false,
    reviewClient: $('dispatch-opt-peer-review')?.checked ? 'auto' : ''
  };
  try {
    const res = await apiRequest('/api/dispatch-flags', {
      method: 'POST',
      body: JSON.stringify(flags)
    });
    if (res && res.updatedAt) {
      lastSyncedFlagsTimestamp = res.updatedAt;
    } else {
      lastSyncedFlagsTimestamp = new Date().toISOString();
    }
    showFlagsSyncBadge('🔄 已同步最新全局状态');
    return res;
  } catch (e) {
    console.warn('[FleetRadar] Failed to persist active flags:', e.message);
  }
}

function renderDispatchHistoryTable(history) {
  const tbody = $('dispatch-history-table-body');
  if (!tbody) return;
  if (!history || history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无跨会话派发流水记录</td></tr>';
    return;
  }
  tbody.innerHTML = history.map(item => {
    const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '—';
    const sourceLabel = item.source === 'chat_agent' ? '<span class="badge" style="background:#1f2937;color:#9ca3af;">0号主控</span>' : '<span class="badge" style="background:#1e3a5f;color:#60a5fa;">Radar面板</span>';
    
    let badges = [];
    if (item.flags?.selfTest) badges.push('<span class="tag-badge green">🧪 自测</span>');
    if (item.flags?.smartNew) badges.push('<span class="tag-badge blue">🧠 新窗</span>');
    if (item.flags?.autoSplit) badges.push('<span class="tag-badge purple">📐 拆分</span>');
    if (item.flags?.overdraftProtect === false) badges.push('<span class="tag-badge red">⚡ 透支放开</span>');
    else if (item.flags?.overdraftProtect === true) badges.push('<span class="tag-badge green">🛡️ 透支保护</span>');
    if (item.flags?.reviewClient) badges.push(`<span class="tag-badge orange">👥 审查:${item.flags.reviewClient}</span>`);
    const badgesHtml = badges.length > 0 ? badges.join(' ') : '<span class="text-muted text-xs">默认直出</span>';

    const tierBadge = (item.scaleTier || 'Tier S/M').includes('L/XL')
      ? '<span class="badge badge-tier-large">🟣 Tier L/XL</span>'
      : '<span class="badge badge-tier-small">🟢 Tier S/M</span>';

    const promptPreview = escapeHtml(item.promptPreview || '—');
    const cidShort = item.subCascadeId ? `<code class="text-xs" title="${item.subCascadeId}">${item.subCascadeId.substring(0, 8)}...</code>` : '—';

    return `
      <tr>
        <td class="text-xs text-muted">${timeStr}</td>
        <td>${sourceLabel}</td>
        <td><strong>${escapeHtml(item.targetName || item.targetId)}</strong> ${item.reusedChat ? '<span class="text-xs text-muted">(复用)</span>' : '<span class="text-xs text-success">(新开)</span>'}</td>
        <td>${badgesHtml}</td>
        <td>${tierBadge}</td>
        <td class="text-xs" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${promptPreview}">${promptPreview}</td>
        <td>${cidShort}</td>
      </tr>
    `;
  }).join('');
}

function renderDispatchStateSync(dispatchState) {
  if (!dispatchState) return;

  const lastDispatch = dispatchState.lastDispatch;
  const banner1 = $('overview-dispatch-banner');
  const banner3 = $('tab3-dispatch-banner');

  if (lastDispatch) {
    const html = renderDispatchBannerHtml(lastDispatch);
    if (banner1) {
      banner1.innerHTML = html;
      banner1.style.display = 'block';
    }
    if (banner3) {
      banner3.innerHTML = html;
      banner3.style.display = 'block';
    }
  } else {
    if (banner1) banner1.style.display = 'none';
    if (banner3) banner3.style.display = 'none';
  }

  // 多端与跨会话开关同步：检测服务端版本戳是否变更
  const serverUpdatedAt = dispatchState.updatedAt;
  const isUserInteracting = (Date.now() - lastUserFlagInteractionMs) < 6000;

  if (!isUserInteracting && dispatchState.activeFlags) {
    const serverTime = serverUpdatedAt ? Date.parse(serverUpdatedAt) : 0;
    const localTime = lastSyncedFlagsTimestamp ? Date.parse(lastSyncedFlagsTimestamp) : 0;

    if (serverTime > localTime) {
      syncDispatchFlagsFromState(dispatchState.activeFlags, true);
      lastSyncedFlagsTimestamp = serverUpdatedAt;
      showFlagsSyncBadge('🔄 已从主控同步全局开关');
    } else if (!lastSyncedFlagsTimestamp && serverUpdatedAt) {
      syncDispatchFlagsFromState(dispatchState.activeFlags, true);
      lastSyncedFlagsTimestamp = serverUpdatedAt;
    }
  }

  renderDispatchHistoryTable(dispatchState.history);
}

/**
 * Antigravity Fleet Radar · 前端交互主控逻辑
 * 支持 0号 Ultra 总控大盘、客户端矩阵、模型/会话账单、智能派发台与动态扩容管理
 */

// -----------------------------------------------------------------------------
// 1. 国际化字典 (i18n)
// -----------------------------------------------------------------------------
const I18N = {
  zh: {
    connConnected: '实时已连接',
    connDisconnected: '未连接后端',
    connConnecting: '正在连接...',
    rangeToday: '今日',
    range24h: '近24h',
    range7d: '近7天',
    rangeAll: '全部',
    dualTrackTitle: '全舰队 Token 双轨对比 (实扣 vs 缓存命中)',
    cacheHitRateLabel: '缓存命中率',
    realBilledTokens: '实扣额度 (Uncached In + Out)',
    cacheReadTokens: '缓存读取命中 (Cache Read)',
    uncachedInput: '未缓存输入',
    cacheRead: '缓存读取',
    outputTokens: '模型生成输出',
    totalTokensSum: '总吞吐流水',
    billingCardTitle: 'Google AI Studio 计费账单与节省',
    pricingSynced: '官方官价已同步',
    realCostUsd: '真实消耗账单',
    realCostDesc: '实扣 Token 真实折合美元',
    cacheSavedUsd: '缓存已省下金额',
    cacheSavedDesc: 'Prompt 缓存命中省下的真金白银',
    pricingSourceLabel: '价格基准：',
    nominalTotalLabel: '原始等值总价：',
    tabFleet: '舰队矩阵 (Fleet)',
    tabModels: '会话与模型账单 (Sessions & Models)',
    tabDispatch: '智能派发台 (Smart Dispatch)',
    tabManage: '客户端扩展管理 (+ 节点扩容)',
    filterAll: '全部客户端',
    filterWorker: '仅从属从机 (Pro 1~N)',
    filterDispatchable: '参与派发中',
    modelsTableTitle: '全舰队模型使用明细与 Google AI Studio 价格核算',
    modelsTableSub: '按所选时间范围统计各模型请求数、实扣与缓存量及支出',
    sessionsTableTitle: '跨客户端最近会话列表 (流量与成本监控)',
    searchSessions: '搜索会话标题、ID或模型...',
    thModel: '模型名称 (Model)',
    thRequests: '请求次数',
    thUncached: '未缓存输入',
    thCacheRead: '缓存读取',
    thOutput: '生成输出',
    thHitRate: '缓存命中率',
    thCost: '折算美元花费',
    thClient: '所属客户端',
    thSessionTitle: '会话标题 / 标识',
    thSessionModel: '调用的模型',
    thRounds: '轮数/步数',
    thBilledTokens: '实扣 Token',
    thSessionCost: '会话美元花费',
    thAction: '操作',
    aiRecLabel: '⚡ AI 负载均衡推荐目标：',
    btnUseRec: '一键选定推荐目标',
    dispatchTargetLabel: '选择执行客户端',
    dispatchTargetTip: '(支持智能自动分配或手动多选并发)',
    modeAutoBalanced: '⚡ 自动按剩余额度与重置倒计时均衡分配 (Reset-Urgency Balanced)',
    modeAutoBalancedDesc: '自动测算 5h/周额度及重置倒计时，5h临期白嫖优先提权，挑选最优节点派发',
    modeManual: '🎯 手动指定单台或并发勾选多台',
    modeManualDesc: '自由勾选目标从机，支持多客户端同时协作并统一汇报',
    taskPromptLabel: '任务指令 (Prompt)',
    optForceNew: '强制新建会话窗口 (忽略绑定，开新对话)',
    optSmartNew: '🧠 智能新建会话窗口 (检测到新话题/新项目或旧会话超载时，自动在 Pro 中开新窗口)',
    optAutoSplit: '📐 开启智能规模评估与自动多机拆分 (Auto-Scale & Split)',
    optOverdraftProtect: '🛡️ 开启周透支节点保护（暂停调动预计周结余为负的节点，关闭则可继续满血使用）',
    optCallback: '任务完成自动回调通知 0号 Ultra 主控 (带完成回调推送)',
      optSelfTest: '开启强制自测闭环 (Self-Test Gate) - 要求编写/运行自测脚本验证通过方可交付',
      optPeerReview: '开启双机交叉审查 (Cross-Client Peer Review) - 由第二空闲节点复核代码质量',
    btnSendDispatch: '🚀 立即派发指令',
    dispatchNotice: '遵循静默派发铁律：派发后子客户端窗口每 2 分钟自主汇报，完成后自动回调回 Ultra 主控。',
    dispatchSuccessTitle: '派发任务已提交成功',
    resTarget: '执行客户端：',
    resCascadeId: '会话 CascadeId：',
    resReason: '调度分配依据：',
    manageTitle: '舰队节点拓扑与动态扩容',
    manageDesc: '管理本机的 Antigravity 客户端注册表。支持一键将本地多实例（如 Pro 6号、Pro 7号等）纳入总控调度并自动建立目录联接。',
    btnAddClient: '+ 新增扩容客户端 (Pro X)',
    modalAddTitle: '新增舰队从属节点 (Node Expansion)',
    fieldClientId: '客户端标识 (ID, 如 pro6)',
    fieldClientName: '显示名称 (Name)',
    fieldClientEmail: '登录 Google 邮箱',
    fieldClientRole: '角色定位',
    fieldClientRoaming: 'Roaming 配置目录路径',
    fieldClientBrain: 'Brain 工作区目录路径',
    fieldClientShortcut: '桌面启动快捷方式路径 (可选)',
    optAutoInitJunction: '⚡ 自动在本地初始化该客户端目录与配置联接（Junction）',
    roleWorker: '从属工作节点 (Worker)',
    roleMaster: '指挥控制节点 (Master)',
    btnCancel: '取消',
    btnConfirmAdd: '确认注册扩容',
    loadingFleet: '正在探测全舰队实时状态与配额...',
    noModelData: '暂无模型调用数据',
    noSessionData: '暂无跨客户端会话记录',
    copyIdSuccess: '会话 ID 已复制',
    dispatching: '正在调度派发...',
    online: '在线',
    offline: '离线',
    fiveHourQuota: '5小时额度',
    weeklyQuota: '周额度',
    remaining: '剩余',
    resetIn: '后重置',
    noQuota: '无配额限制',
    heavySessionTag: '🔥 高消耗会话',
    participateDispatch: '参与自动派发',
    notParticipating: '已停用派发'
  },
  en: {
    connConnected: 'Live Connected',
    connDisconnected: 'Disconnected',
    connConnecting: 'Connecting...',
    rangeToday: 'Today',
    range24h: '24 Hours',
    range7d: '7 Days',
    rangeAll: 'All Time',
    dualTrackTitle: 'Fleet Token Dual-Track (Billed vs Cache Read)',
    cacheHitRateLabel: 'Cache Hit Rate',
    realBilledTokens: 'Billed Tokens (Uncached In + Out)',
    cacheReadTokens: 'Cache Read Hit Tokens',
    uncachedInput: 'Uncached Input',
    cacheRead: 'Cache Read',
    outputTokens: 'Model Output',
    totalTokensSum: 'Total Throughput',
    billingCardTitle: 'Google AI Studio Billing & Savings',
    pricingSynced: 'Pricing Synced',
    realCostUsd: 'Real Incurred Cost',
    realCostDesc: 'Actual USD bill based on billed tokens',
    cacheSavedUsd: 'Saved by Cache',
    cacheSavedDesc: 'Real dollars saved via prompt caching',
    pricingSourceLabel: 'Price Source:',
    nominalTotalLabel: 'Nominal Value:',
    tabFleet: 'Fleet Matrix',
    tabModels: 'Sessions & Models',
    tabDispatch: 'Smart Dispatch',
    tabManage: 'Client Expansion (+ Nodes)',
    filterAll: 'All Clients',
    filterWorker: 'Workers Only (Pro 1~N)',
    filterDispatchable: 'Dispatch Enabled',
    modelsTableTitle: 'Fleet Model Usage & Google AI Studio Cost Breakdown',
    modelsTableSub: 'Requests, input/output/cache tokens, and USD costs by model',
    sessionsTableTitle: 'Cross-Client Recent Sessions (Traffic & Cost Auditing)',
    searchSessions: 'Search title, ID, or model...',
    thModel: 'Model',
    thRequests: 'Requests',
    thUncached: 'Uncached In',
    thCacheRead: 'Cache Read',
    thOutput: 'Output',
    thHitRate: 'Cache Hit %',
    thCost: 'Cost (USD)',
    thClient: 'Client',
    thSessionTitle: 'Session Title / ID',
    thSessionModel: 'Primary Model',
    thRounds: 'Steps/Rounds',
    thBilledTokens: 'Billed Tokens',
    thSessionCost: 'Session Cost',
    thAction: 'Action',
    aiRecLabel: '⚡ AI Load Balancing Recommended Target:',
    btnUseRec: 'Select Recommended Target',
    dispatchTargetLabel: 'Select Target Client',
    dispatchTargetTip: '(Auto-balanced or multi-client concurrent)',
    modeAutoBalanced: '⚡ Reset-Urgency & Remaining Quota Auto-Balanced',
    modeAutoBalancedDesc: 'Auto-evaluates 5h/weekly quotas and reset countdowns with urgent burn-rate boost',
    modeManual: '🎯 Manual Single / Multi-Select',
    modeManualDesc: 'Manually check specific worker clients to run concurrent tasks',
    taskPromptLabel: 'Task Instructions (Prompt)',
    optForceNew: 'Force new conversation window (Ignore bound session)',
    optSmartNew: '🧠 Smart new window (Auto-creates new window on topic shift / context overload)',
    optAutoSplit: '📐 Enable Auto Task Scale Evaluation & Multi-Client Split',
    optOverdraftProtect: '🛡️ Enable Weekly Overdraft Protection (Pause dispatching negative projected weekly remaining nodes)',
    optCallback: 'Auto-callback report to 0 Ultra master upon task completion',
    btnSendDispatch: '🚀 Dispatch Task Now',
    dispatchNotice: 'Silent Dispatch Rule: Workers report progress every 2m and callback upon completion.',
    dispatchSuccessTitle: 'Task Dispatched Successfully',
    resTarget: 'Dispatched Target:',
    resCascadeId: 'Session CascadeId:',
    resReason: 'Selection Reason:',
    manageTitle: 'Fleet Node Topology & Expansion',
    manageDesc: 'Manage registered local Antigravity clients and auto-create junction links for Pro 6~N.',
    btnAddClient: '+ Add Expansion Client (Pro X)',
    modalAddTitle: 'Add Fleet Worker Node',
    fieldClientId: 'Client Identifier (ID, e.g. pro6)',
    fieldClientName: 'Display Name',
    fieldClientEmail: 'Google Account Email',
    fieldClientRole: 'Node Role',
    fieldClientRoaming: 'Roaming Config Path',
    fieldClientBrain: 'Brain Workspace Path',
    fieldClientShortcut: 'Desktop Shortcut Path (Optional)',
    optAutoInitJunction: '⚡ Automatically initialize local directory and Junction link',
    roleWorker: 'Worker Node',
    roleMaster: 'Master Commander',
    btnCancel: 'Cancel',
    btnConfirmAdd: 'Register & Expand',
    loadingFleet: 'Probing fleet real-time statuses and quotas...',
    noModelData: 'No model invocation records found',
    noSessionData: 'No cross-client session records found',
    copyIdSuccess: 'Session ID copied',
    dispatching: 'Dispatching...',
    online: 'Online',
    offline: 'Offline',
    fiveHourQuota: '5h Quota',
    weeklyQuota: 'Weekly Quota',
    remaining: 'remaining',
    resetIn: 'resets in',
    noQuota: 'No limit',
    heavySessionTag: '🔥 Heavy Session',
    participateDispatch: 'Auto Dispatch On',
    notParticipating: 'Dispatch Off'
  }
};

// -----------------------------------------------------------------------------
// 2. 状态管理与辅助格式化函数
// -----------------------------------------------------------------------------
let currentLang = localStorage.getItem('fleet-radar-lang') || 'zh';
let currentRange = 'today';
let currentFilter = 'all';
let latestFleetData = null;
let pollTimer = null;
let isDispatching = false;

const $ = id => document.getElementById(id);
const t = key => I18N[currentLang]?.[key] || I18N['zh']?.[key] || key;

/** 数字格式化：12.5k / 1.2M 或完整千分位 */
function formatNumber(n, compact = false) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (compact) {
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  return n.toLocaleString('en-US');
}

/** 美元金额格式化：$0.0124 */
function formatUSD(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '$0.0000';
  if (amount === 0) return '$0.0000';
  if (amount < 0.0001) return '<$0.0001';
  if (amount >= 100) return '$' + amount.toFixed(2);
  return '$' + amount.toFixed(4);
}

/** 百分比格式化：智能支持 0~1 的比率小数 (如 0.901 -> 90.1%) 与 0~100 的百分比数值 (如 90.1 -> 90.1%) */
function formatPercent(val) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '0.0%';
  const pct = (val > 0 && val <= 1) ? val * 100 : val;
  return pct.toFixed(1) + '%';
}

/** 倒计时秒数转换：1h 24m 或 45s */
function formatCountdown(sec) {
  if (typeof sec !== 'number' || sec <= 0) return '即将重置';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// -----------------------------------------------------------------------------
// 3. 通信与 API 封装 (兼容 Sidecar SDK、GitHub Pages 跨域与独立 HTTP 模式)
// -----------------------------------------------------------------------------
let API_BASE = '';

function resolveApiBase() {
  if (typeof window === 'undefined' || !window.location) return 'http://127.0.0.1:17892';

  const savedApi = (typeof localStorage !== 'undefined' && localStorage.getItem('fleet_api_base')) || '';
  if (savedApi) return savedApi.trim().replace(/\/+$/, '');

  const hostname = window.location.hostname || '';

  // 如果处于公网 HTTPS 托管环境（如 GitHub Pages 或 Cloudflare 隧道）
  const isPublicWeb = hostname.endsWith('github.io') || hostname.includes('trycloudflare.com');
  if (isPublicWeb) {
    if (window.location.origin && window.location.origin !== 'null' && !hostname.endsWith('github.io')) {
      return window.location.origin.replace(/\/+$/, '');
    }
    return ''; // GitHub Pages 默认等待 resolveRemoteConfig 载入 remote_config.json
  }

  // 本地环境（包括 Antigravity 内嵌控制面板 plugin://、vscode-webview://、localhost、127.0.0.1 等），一律优先统一指向 127.0.0.1:17892！
  return 'http://127.0.0.1:17892';
}

function initRemoteAccessConfig() {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      const keyFromUrl = searchParams.get('key');
      const apiFromUrl = searchParams.get('api');

      if (keyFromUrl) {
        localStorage.setItem('fleet_access_key', keyFromUrl.trim());
      }
      if (apiFromUrl) {
        const cleanApi = apiFromUrl.trim().replace(/\/+$/, '');
        localStorage.setItem('fleet_api_base', cleanApi);
      }

      // 自动擦除地址栏中的敏感参数，保护专属暗号密钥
      if (keyFromUrl || apiFromUrl) {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl || '/');
      }
    }
  } catch (e) {
    console.warn('[FleetRadar] 解析 URL 参数失败:', e);
  }

  API_BASE = resolveApiBase();
}

// 自动发现 remote_config.json 或优雅回退
async function resolveRemoteConfig() {
  if (typeof window === 'undefined' || !window.location) return;

  const isGitHubPages = Boolean(window.location.hostname && window.location.hostname.endsWith('github.io'));
  const savedApi = (typeof localStorage !== 'undefined' && localStorage.getItem('fleet_api_base')) || '';

  if (isGitHubPages && !savedApi) {
    try {
      const res = await window.fetch('./remote_config.json?t=' + Date.now());
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && cfg.apiBase) {
          API_BASE = cfg.apiBase.replace(/\/+$/, '');
          console.log('[FleetRadar] 成功从 remote_config.json 获取最新公网隧道 API:', API_BASE);
          return;
        }
      }
    } catch (e) {
      console.warn('[FleetRadar] 自动获取 remote_config.json 异常:', e.message);
    }
  }

  if (!API_BASE) {
    API_BASE = resolveApiBase() || 'http://127.0.0.1:17892';
  }
}

// 立即执行同步参数解析与暗号记忆
initRemoteAccessConfig();

async function apiRequest(path, options = {}) {
  // 动态寻址全路径
  let fullUrl = path;
  if (!path.startsWith('http://') && !path.startsWith('https://')) {
    const base = API_BASE ? API_BASE.replace(/\/+$/, '') : '';
    fullUrl = base ? (base + (path.startsWith('/') ? '' : '/') + path) : path;
  }

  const transport = (typeof window !== 'undefined' && window.fetch)
    ? window.fetch.bind(window)
    : (window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch);

  const accessKey = (typeof localStorage !== 'undefined' && localStorage.getItem('fleet_access_key')) || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(accessKey ? { 'X-Fleet-Key': accessKey } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await transport(fullUrl, {
      ...options,
      headers
    });
    if (!res.ok) {
      if (res.status === 403) {
        const statusEl = typeof $ === 'function' ? $('connection-status') : null;
        if (statusEl) statusEl.textContent = '403 鉴权失败：缺少暗号书签密钥 (?key=...)';
        const dotEl = typeof $ === 'function' ? $('connection-dot') : null;
        if (dotEl) {
          dotEl.className = 'status-dot';
          dotEl.style.background = '#f85149';
        }
      }
      throw new Error('HTTP ' + res.status + ': ' + res.statusText);
    }
    return await res.json();
  } catch (err) {
    console.warn('[FleetRadar] API Request error (' + fullUrl + '):', err.message);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 4. 界面本地化与国际化渲染
// -----------------------------------------------------------------------------
function localizeUI() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  $('lang-label').textContent = currentLang === 'zh' ? '中' : 'EN';
  $('lang-btn').title = currentLang === 'zh' ? '切换为英文 / Switch to English' : 'Switch to Chinese / 切换中文';

  // 替换所有 data-i18n 属性
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (I18N[currentLang]?.[key]) {
      el.textContent = I18N[currentLang][key];
    }
  });

  // 替换 placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (I18N[currentLang]?.[key]) {
      el.placeholder = I18N[currentLang][key];
    }
  });

  // 重新渲染当前数据
  if (latestFleetData) {
    renderDashboard(latestFleetData);
  }
}

function toggleLanguage() {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('fleet-radar-lang', currentLang);
  localizeUI();
}

// -----------------------------------------------------------------------------
// 5. 核心数据拉取与轮询
// -----------------------------------------------------------------------------
async function fetchFleetData(force = false) {
  const refreshBtn = $('refresh-btn');
  if (force) refreshBtn?.classList.add('spinning');

  try {
    const url = `/api/fleet?range=${currentRange}${force ? '&force=1' : ''}`;
    const data = await apiRequest(url);
    latestFleetData = data;
    renderDashboard(data);

    // 更新连接状态
    $('connection-dot').className = 'status-dot live';
    $('connection-status').textContent = t('connConnected');
    $('last-updated').textContent = new Date().toLocaleTimeString();
  } catch (err) {
    // 若请求失败（如后端正在冷启动或测试模式），使用基于规范的兜底展示数据
    if (!latestFleetData) {
      latestFleetData = getFallbackFleetData();
      renderDashboard(latestFleetData);
    }
    $('connection-dot').className = 'status-dot';
    $('connection-status').textContent = t('connConnecting');
  } finally {
    if (force) {
      setTimeout(() => refreshBtn?.classList.remove('spinning'), 500);
    }
  }
}

// -----------------------------------------------------------------------------
// 6. 总览大盘渲染 (实扣 vs 缓存命中双轨条 & Google AI Studio 账单)
// -----------------------------------------------------------------------------
function renderDashboard(data) {
  if (!data) return;
  const totals = data.totals || {};
  const pricing = data.pricing || {};

  // 1. 顶部节点总数
  const clientList = data.clients || [];
  const onlineCount = clientList.filter(c => c.online).length;
  $('fleet-node-count').textContent = `${clientList.length} 节点 (${onlineCount} 在线)`;
  $('badge-fleet-online').textContent = `${onlineCount}/${clientList.length} ${t('online')}`;

  // 2. 双轨条比例与数值
  const billedTokens = totals.realBilledTokens || 0;
  const cacheTokens = totals.cacheReadTokens || 0;
  const totalSum = (billedTokens + cacheTokens) || 1;
  const hitRate = (typeof totals.cacheHitRate === 'number')
    ? totals.cacheHitRate
    : ((cacheTokens / totalSum) * 100);

  const billedPct = Math.max(2, Math.min(98, (billedTokens / totalSum) * 100));
  const cachePct = Math.max(2, Math.min(98, (cacheTokens / totalSum) * 100));

  $('bar-billed').style.width = `${billedPct}%`;
  $('bar-cache').style.width = `${cachePct}%`;
  $('overview-cache-rate').textContent = formatPercent(hitRate);

  $('stat-billed-tokens').textContent = formatNumber(billedTokens, true);
  $('stat-cache-tokens').textContent = formatNumber(cacheTokens, true);
  $('stat-uncached-input').textContent = formatNumber(totals.uncachedInputTokens || 0, true);
  $('stat-cache-read').textContent = formatNumber(cacheTokens, true);
  $('stat-output-tokens').textContent = formatNumber(totals.outputTokens || 0, true);
  $('stat-total-tokens').textContent = formatNumber(totals.totalTokens || (billedTokens + cacheTokens), true);

  // 3. Google AI Studio 账单与节省金额
  $('stat-real-cost').textContent = (totals.realCostUsd ?? 0.00).toFixed(4);
  $('stat-saved-cost').textContent = (totals.cacheSavedUsd ?? 0.00).toFixed(4);
  $('stat-nominal-cost').textContent = formatUSD(totals.estimatedCostUsd || ((totals.realCostUsd || 0) + (totals.cacheSavedUsd || 0)));

  if (pricing.source) {
    $('pricing-source-tag').textContent = `${pricing.source} (${new Date(pricing.updatedAt || Date.now()).toLocaleDateString()})`;
  }

  // 4. AI 负载均衡推荐更新
  const recTargetId = totals.recommendedTarget || 'pro1';
  const recClient = clientList.find(c => c.id === recTargetId) || clientList[1] || clientList[0];
  if (recClient) {
    $('rec-target-name').textContent = recClient.name;
    $('badge-dispatch-rec').textContent = `AI 推荐: ${recClient.name}`;
    const score = recClient.loadScore ?? 95;
    $('rec-target-score').textContent = `综合得分: ${score}分`;
    const fiveHRemain = recClient.quota?.fiveHour?.remaining ?? 0.9;
    const timeReasonDesc = recClient.timeReason && recClient.timeReason !== '-' ? `【${recClient.timeReason}】` : '';
    const resetDesc = recClient.fiveHourResetText && recClient.fiveHourResetText !== '-' ? `，5h重置倒计时: ${recClient.fiveHourResetText}` : '';
    const projDesc = recClient.projectedEndRemainingText && recClient.projectedEndRemainingText !== '-' ? `，一周结束前预计剩余: ${recClient.projectedEndRemainingText}` : '';
    $('rec-target-reason').textContent = `${t('fiveHourQuota')}剩余 ${(fiveHRemain * 100).toFixed(0)}%${resetDesc}${projDesc}，周额度健康${timeReasonDesc ? '，' + timeReasonDesc : ''}，综合评分领先，推荐作为本轮任务派发目标。`;
  }

  // 账号池徽章数量更新
  const accountsCount = data.accounts?.length || 0;
  if ($('badge-accounts-count')) {
    $('badge-accounts-count').textContent = `${accountsCount} 账号`;
  }

  // 5. 渲染各 Tab 内容
  renderFleetTab(clientList);
  renderAccountsTab(data);
  renderModelsAndSessionsTab(data);
  renderDispatchClientCheckboxes(clientList);
  renderManageTab(clientList);
  renderDispatchStateSync(data.dispatchState);
  populateDispatchModels();
}

// -----------------------------------------------------------------------------
// 7. Tab 1: 舰队矩阵卡片渲染 (Fleet Matrix)
// -----------------------------------------------------------------------------
function renderFleetTab(clients) {
  const container = $('fleet-cards-container');
  if (!container) return;

  // 筛选客户端
  let filtered = clients;
  if (currentFilter === 'worker') {
    filtered = clients.filter(c => c.role !== 'master');
  } else if (currentFilter === 'dispatchable') {
    filtered = clients.filter(c => c.enabledForDispatch);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>${t('noSessionData')}</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(client => {
    const isMaster = client.role === 'master';
    const isOnline = Boolean(client.online);
    const roleBadgeClass = isMaster ? 'master-badge' : 'worker-badge';
    const roleLabel = isMaster ? (currentLang === 'zh' ? '0号主控' : 'Master') : (currentLang === 'zh' ? '工作从机' : 'Worker');

    // 配额数据
    const fiveH = client.quota?.fiveHour;
    const fiveHRemain = fiveH?.remaining ?? 1;
    const fiveHPct = typeof fiveHRemain === 'number' ? Math.max(0, Math.min(100, Math.round(fiveHRemain * 100))) : 100;
    const fiveHColorClass = fiveHPct <= 15 ? 'danger' : fiveHPct <= 40 ? 'warn' : '';
    const fiveHCountdown = client.fiveHourResetText && client.fiveHourResetText !== '-'
      ? client.fiveHourResetText
      : (fiveH?.countdownSec ? formatCountdown(fiveH.countdownSec) : (fiveH?.resetAt ? new Date(fiveH.resetAt).toLocaleTimeString() : '充裕'));

    const weekQ = client.quota?.weekly;
    const weekRemain = weekQ?.remaining ?? 1;
    const weekPct = typeof weekRemain === 'number' ? Math.max(0, Math.min(100, Math.round(weekRemain * 100))) : 100;
    const weekColorClass = weekPct <= 15 ? 'danger' : weekPct <= 40 ? 'warn' : '';
    const weekCountdown = weekQ?.countdownSec ? formatCountdown(weekQ.countdownSec) : (weekQ?.resetAt ? new Date(weekQ.resetAt).toLocaleDateString() : '充裕');

    // 活跃会话与 TPS
    const session = client.activeSession || {};
    const sessionTitle = session.title || (isOnline ? '就绪等待任务派发' : '客户端离线');
    const sessionModel = session.model || (isMaster ? 'Gemini 3.8 Ultra' : 'Gemini 3.8 Flash');
    const tps = session.tps || session.latestTps || 0;
    const ctxUsed = session.contextUsedTokens || 0;
    const ctxMax = session.contextMaxTokens || 1000000;
    const ctxPct = Math.round((ctxUsed / ctxMax) * 100);

    // 消耗
    const usage = client.usage || {};
    const billed = usage.realBilledTokens || 0;
    const cache = usage.cacheReadTokens || 0;
    const cost = usage.realCostUsd ?? usage.costUsd ?? 0;

    return `
      <div class="client-card ${isMaster ? 'is-master' : 'is-worker'}" data-client-id="${client.id}">
        <div class="client-card-header">
          <div class="client-title-group">
            <div class="client-name-row">
              <span class="client-name">${client.name}</span>
              <span class="badge ${roleBadgeClass}">${roleLabel}</span>
              ${client.timeZone === 'urgent-burn' ? `<span class="badge badge-urgent-burn" title="${client.timeReason || '临期重置极速提权'}">🔥 临期优先白嫖</span>` : ''}
              ${(client.timeBonus && client.timeBonus !== 0) ? `<span class="badge ${client.timeBonus > 0 ? 'badge-time-bonus' : 'badge-time-penalty'}" title="${client.timeReason || ''}">⚡ 加权: ${client.timeBonus > 0 ? '+' : ''}${client.timeBonus}分</span>` : ''}
              ${(client.projectedEndRemainingText && client.projectedEndRemainingText !== '-') ? `<span class="badge" style="background:${client.projectedEndRemainingPct >= 30 ? 'rgba(63,185,80,0.15);color:#3fb950;border:1px solid rgba(63,185,80,0.3)' : client.projectedEndRemainingPct >= 15 ? 'rgba(210,153,34,0.15);color:#d29922;border:1px solid rgba(210,153,34,0.3)' : 'rgba(248,81,73,0.15);color:#f85149;border:1px solid rgba(248,81,73,0.3)'};" title="一周结束前预计剩余额度">🔮 周预计结余: ${client.projectedEndRemainingText}</span>` : ''}
              ${(latestFleetData?.dispatchState?.lastDispatch?.targetId === client.id && latestFleetData.dispatchState.lastDispatch.flags?.selfTest) ? '<span class="badge badge-selftest" title="强制自测闭环门禁生效中">🧪 自测门禁中</span>' : ''}
              ${(latestFleetData?.dispatchState?.lastDispatch?.targetId === client.id && latestFleetData.dispatchState.lastDispatch.flags?.reviewClient) ? '<span class="badge badge-review" title="交叉审查门禁生效中">👥 交叉审查中</span>' : ''}
              ${client.pid ? `<span class="badge" style="background:var(--bg-input);color:var(--text-subtle);">PID: ${client.pid}</span>` : ''}
            </div>
            <div class="client-email">${(client.loggedIn && client.email) ? escapeHtml(client.email) : '<span class="client-status-offline">⚪ 未登录任何账号 (Not Logged In)</span>'}</div>
          </div>
          <div class="client-status-indicator ${isOnline ? 'online' : 'offline'}">
            <span class="status-dot ${isOnline ? 'live' : ''}"></span>
            <span>${isOnline ? t('online') : t('offline')}</span>
          </div>
        </div>

        <!-- 5h 与周配额双进度条 -->
        <div class="quota-bars-box">
          <div class="quota-item">
            <div class="quota-item-header">
              <span class="quota-label">
                <svg class="icon mini-icon"><use href="#icon-clock"/></svg>
                <span>${t('fiveHourQuota')}</span>
              </span>
              <div class="quota-metric">
                <span>${fiveHPct}% ${t('remaining')}</span>
                <span class="quota-countdown" title="距离5小时额度重置倒计时">⏱️ ${fiveHCountdown}</span>
              </div>
            </div>
            <div class="quota-track-bar">
              <div class="quota-fill-bar ${fiveHColorClass}" style="width: ${fiveHPct}%"></div>
            </div>
          </div>

          <div class="quota-item">
            <div class="quota-item-header">
              <span class="quota-label">
                <svg class="icon mini-icon"><use href="#icon-calendar"/></svg>
                <span>${t('weeklyQuota')}</span>
              </span>
              <div class="quota-metric">
                <span>${weekPct}% ${t('remaining')}</span>
                <span class="quota-countdown">(${weekCountdown})</span>
              </div>
            </div>
            <div class="quota-track-bar">
              <div class="quota-fill-bar ${weekColorClass}" style="width: ${weekPct}%"></div>
            </div>
          </div>
        </div>

        <!-- 活跃会话与实时性能 -->
        <div class="active-session-box">
          <div class="active-session-title">
            <span class="session-name-text" title="${sessionTitle}">${sessionTitle}</span>
            <span class="session-badge-model">${sessionModel}</span>
          </div>
          <div class="active-session-stats">
            <span>TPS: <strong>${tps.toFixed(1)}</strong> tok/s</span>
            <span>Ctx: <strong>${ctxPct}%</strong> (${formatNumber(ctxUsed, true)} tok)</span>
            ${session.rounds ? `<span>轮数: <strong>${session.rounds}</strong></span>` : ''}
          </div>
        </div>

        <!-- 卡片底部消耗与派发开关 -->
        <div class="client-card-footer">
          <div class="client-today-usage">
            <span>实扣: <strong>${formatNumber(billed, true)}</strong></span>
            <span>缓存: <strong>${formatNumber(cache, true)}</strong></span>
            <span>花费: <strong>${formatUSD(cost)}</strong></span>
          </div>

          ${!isMaster ? `
            <label class="toggle-option dispatch-toggle-wrap" title="切换是否参与 auto-balanced 自动派发">
              <input type="checkbox" class="chk-dispatch-toggle" data-id="${client.id}" ${client.enabledForDispatch ? 'checked' : ''}>
              <span class="toggle-switch"></span>
              <span class="toggle-label">${client.enabledForDispatch ? t('participateDispatch') : t('notParticipating')}</span>
            </label>
          ` : `
            <span class="badge master-badge">主控不参与被派发</span>
          `}
        </div>
      </div>
    `;
  }).join('');

  // 绑定开关事件
  container.querySelectorAll('.chk-dispatch-toggle').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const clientId = e.target.dataset.id;
      const enabled = e.target.checked;
      try {
        await apiRequest('/api/clients', {
          method: 'POST',
          body: JSON.stringify({ action: 'toggle-dispatch', clientId, enabled })
        });
        fetchFleetData(false);
      } catch (err) {
        alert('修改派发开关失败: ' + err.message);
        e.target.checked = !enabled;
      }
    });
  });
}

// -----------------------------------------------------------------------------
// 7.5. Tab 2: 账号用量与周度耗尽预测渲染 (Accounts & Weekly Forecast)
// -----------------------------------------------------------------------------
function renderAccountsTab(data) {
  if (!data) return;
  const accounts = data.accounts || [];
  const summary = data.accountsSummary || {};

  // 1. 顶部 4 张 KPI 卡片
  if ($('acc-kpi-count')) {
    const realCount = summary.realAccountCount ?? accounts.length;
    const onCount = summary.onlineAccountCount ?? 0;
    const offCount = summary.offlineAccountCount ?? 0;
    $('acc-kpi-count').textContent = `${realCount} 账号 (${onCount} 在线 / ${offCount} 待轮转)`;
  }
  if ($('acc-kpi-filtered-tip')) {
    const unlogged = summary.filteredUnloggedClients || [];
    $('acc-kpi-filtered-tip').textContent = unlogged.length > 0
      ? `已自动过滤未登录客户端: ${unlogged.join(', ')}`
      : '全客户端账号状态正常';
  }
  if ($('acc-kpi-avg-remain')) {
    $('acc-kpi-avg-remain').textContent = `${summary.avgWeeklyRemainingPct ?? 100.0}%`;
  }
  if ($('acc-kpi-health')) {
    const safeC = summary.safeAccountCount ?? accounts.filter(a => !a.forecast?.willExhaustBeforeReset).length;
    const dangerC = summary.dangerAccountCount ?? accounts.filter(a => a.forecast?.willExhaustBeforeReset).length;
    $('acc-kpi-health').textContent = `${safeC} 🟢 安全 / ${dangerC} 🚨 预警`;
  }
  if ($('acc-kpi-billed-cost')) {
    const billedFmt = formatNumber(summary.totalAccountBilledTokens || 0, true);
    const costFmt = formatUSD(summary.totalAccountCostUsd || 0);
    $('acc-kpi-billed-cost').textContent = `${billedFmt} / ${costFmt}`;
  }

  // 2. 图表区一：各账号垂直柱状图 (Vertical Column Chart)
  const columnChartEl = $('account-column-chart');
  if (columnChartEl) {
    if (accounts.length === 0) {
      columnChartEl.innerHTML = '<div class="empty-state"><p>暂无已验证真实账号数据</p></div>';
    } else {
      let maxBilled = 1;
      for (const a of accounts) {
        if ((a.tokens?.billedTokens || 0) > maxBilled) {
          maxBilled = a.tokens.billedTokens;
        }
      }

      const groupsHtml = accounts.map(a => {
        const emailPrefix = (a.email || '').split('@')[0];
        const clientBadge = a.clientName ? a.clientName.replace(/\(.*?\)/g, '').trim() : (a.currentClientId || '');
        const weeklyPct = Math.max(0, Math.min(100, Math.round(a.weeklyUsedPct || 0)));
        const fiveHPct = Math.max(0, Math.min(100, Math.round(a.fiveHourUsedPct || 0)));
        const tokensBilled = a.tokens?.billedTokens || 0;
        const tokensRatioPct = Math.max(8, Math.min(100, Math.round((tokensBilled / maxBilled) * 100)));

        return `
          <div class="chart-account-group">
            <div class="bars-wrapper">
              <div class="v-bar bar-weekly" style="height: ${Math.max(6, weeklyPct)}%;" title="本周已用额度: ${weeklyPct}%">
                <span class="v-bar-val">${weeklyPct}%</span>
              </div>
              <div class="v-bar bar-5h" style="height: ${Math.max(6, fiveHPct)}%;" title="5h窗口已用: ${fiveHPct}%">
                <span class="v-bar-val">${fiveHPct}%</span>
              </div>
              <div class="v-bar bar-tokens" style="height: ${tokensRatioPct}%;" title="实扣 Token: ${formatNumber(tokensBilled, true)}">
                <span class="v-bar-val">${formatNumber(tokensBilled, true)}</span>
              </div>
            </div>
            <div class="chart-account-label">
              <span class="chart-account-name" title="${escapeHtml(a.email)}">${escapeHtml(emailPrefix)}</span>
              <span class="chart-account-badge">${escapeHtml(clientBadge)}</span>
            </div>
          </div>
        `;
      }).join('');

      const legendHtml = `
        <div class="chart-legend-row" style="width: 100%;">
          <div class="chart-legend-item"><span class="legend-square weekly"></span><span>本周已用 (Weekly Used %)</span></div>
          <div class="chart-legend-item"><span class="legend-square five-hour"></span><span>5h 已用 (5h Used %)</span></div>
          <div class="chart-legend-item"><span class="legend-square tokens"></span><span>实扣 Token (Billed Tokens)</span></div>
        </div>
      `;

      columnChartEl.innerHTML = `
        <div style="display:flex; flex-direction:column; width:100%;">
          <div style="display:flex; align-items:flex-end; justify-content:space-around; width:100%; height:190px;">
            ${groupsHtml}
          </div>
          ${legendHtml}
        </div>
      `;
    }
  }

  // 3. 图表区二：水平堆叠周度预测条形图 (Horizontal Stacked Bar Chart)
  const forecastBarsEl = $('account-forecast-bars');
  if (forecastBarsEl) {
    if (accounts.length === 0) {
      forecastBarsEl.innerHTML = '<div class="empty-state"><p>暂无账号预测数据</p></div>';
    } else {
      forecastBarsEl.innerHTML = accounts.map(a => {
        const fc = a.forecast || {};
        const isOverdraft = fc.willExhaustBeforeReset;
        const usedPct = Math.max(0, Math.min(100, a.weeklyUsedPct || 0));
        
        const hRem = a.weeklyResetHours || 0;
        const vHour = a.burnRateHour || 0;
        const futureBurnPct = Math.max(0, Math.round(vHour * hRem * 10) / 10);

        let segmentsHtml = '';
        if (isOverdraft) {
          const usedWidth = Math.max(5, Math.min(80, usedPct));
          const overdraftWidth = Math.max(20, 100 - usedWidth);
          segmentsHtml = `
            <div class="forecast-segment used-seg" style="width: ${usedWidth}%;" title="本周已用: ${usedPct}%">
              已用 ${usedPct}%
            </div>
            <div class="forecast-segment overdraft-seg" style="width: ${overdraftWidth}%;" title="${escapeHtml(fc.forecastSummary)}">
              🚨 预计透支 (${fc.projectedEndRemainingText}) · ${fc.exhaustInText || '即将耗尽'}
            </div>
          `;
        } else {
          const surplusPct = Math.max(0, fc.rProjected ?? (100 - usedPct - futureBurnPct));
          const totalScale = usedPct + futureBurnPct + surplusPct || 100;
          const usedWidth = (usedPct / totalScale) * 100;
          const futureWidth = (futureBurnPct / totalScale) * 100;
          const surplusWidth = Math.max(6, (surplusPct / totalScale) * 100);

          segmentsHtml = `
            <div class="forecast-segment used-seg" style="width: ${usedWidth.toFixed(1)}%;" title="本周已用: ${usedPct}%">
              已用 ${usedPct}%
            </div>
            ${futureWidth > 1 ? `
            <div class="forecast-segment projected-seg" style="width: ${futureWidth.toFixed(1)}%;" title="按当前流速预计还将消耗: ${futureBurnPct}%">
              预计再耗 ${futureBurnPct}%
            </div>` : ''}
            <div class="forecast-segment surplus-seg" style="width: ${surplusWidth.toFixed(1)}%;" title="预计周重置前安全结余: +${surplusPct.toFixed(1)}%">
              🟢 结余 +${surplusPct.toFixed(1)}%
            </div>
          `;
        }

        const badgeClass = isOverdraft ? 'forecast-badge-danger' : (fc.forecastStatus === 'warning' ? 'forecast-badge-warning' : 'forecast-badge-safe');
        const speedText = a.burnRateDay > 0 ? `${a.burnRateDay.toFixed(1)}% / 天` : '空闲未消耗';

        return `
          <div class="forecast-row-card">
            <div class="forecast-account-info">
              <div class="forecast-email-row">
                <span class="forecast-email" title="${escapeHtml(a.email)}">${escapeHtml(a.email)}</span>
                <span class="badge ${badgeClass}">${fc.statusLabel || (isOverdraft ? '🚨 预计透支' : '🟢 充裕结余')}</span>
              </div>
              <div class="forecast-speed">
                <span>消耗速率：</span>
                <strong class="forecast-speed-highlight">${speedText}</strong>
                <span class="separator">·</span>
                <span>${escapeHtml(a.currentClientId)}</span>
              </div>
            </div>
            <div class="forecast-bar-outer">
              ${segmentsHtml}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. 详情区三：账号轮转与周度预测明细表格 (Account Forecast Table)
  const tbody = $('accounts-table-body');
  if (tbody) {
    if (accounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无已验证真实账号记录</td></tr>';
    } else {
      tbody.innerHTML = accounts.map(a => {
        const fc = a.forecast || {};
        const isOverdraft = fc.willExhaustBeforeReset;
        const tierBadgeClass = a.accountTier?.includes('Ultra') ? 'master-badge' : 'worker-badge';
        const isMounted = a.online;
        const statusHtml = isMounted
          ? `<span class="badge" style="background:rgba(46,160,67,0.2);color:#3fb950;border:1px solid rgba(46,160,67,0.4);">🟢 挂载中: ${escapeHtml(a.clientName || a.currentClientId)}</span>`
          : `<span class="badge" style="background:rgba(110,118,129,0.2);color:#8b949e;border:1px solid rgba(110,118,129,0.4);">⚪ 离线缓存: ${escapeHtml(a.currentClientId)}</span>`;

        const fiveHRemainPct = (a.fiveHourRemaining * 100).toFixed(1);
        const fiveHText = `${a.fiveHourUsedPct}% / <strong style="color:#58a6ff;">${fiveHRemainPct}%</strong> <span class="text-xs text-muted">(${a.fiveHourResetText || '-'})</span>`;

        const weekRemainPct = (a.weeklyRemainingPct || 0).toFixed(1);
        const weekText = `${a.weeklyUsedPct}% / <strong style="color:#58a6ff;">${weekRemainPct}%</strong> <span class="text-xs text-muted">(${a.weeklyResetText || '-'})</span>`;

        const speedText = `${a.burnRateHour || 0}%/h · <strong>${a.burnRateDay || 0}%/天</strong>`;
        const tokensText = `<strong>${formatNumber(a.tokens?.billedTokens || 0, true)}</strong> / <span class="text-xs text-muted">${formatNumber(a.tokens?.totalTokens || 0, true)}</span>`;

        let forecastHtml = '';
        if (isOverdraft) {
          forecastHtml = `<div style="color:#f85149; font-weight:700;">🚨 预计透支 (${fc.projectedEndRemainingText})</div><div class="text-xs" style="color:#ff7b72;">⏳ 约 ${fc.exhaustInText || ''} (${fc.exhaustAtFormatted || ''}) 耗尽</div>`;
        } else {
          forecastHtml = `<div style="color:#3fb950; font-weight:600;">🟢 预计结余 ${fc.projectedEndRemainingText}</div><div class="text-xs text-muted">${fc.forecastSummary}</div>`;
        }

        return `
          <tr>
            <td>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <div style="font-weight:600; color:var(--text-heading);">${escapeHtml(a.email)}</div>
                <div><span class="badge ${tierBadgeClass}">${escapeHtml(a.accountTier || 'Pro')}</span></div>
              </div>
            </td>
            <td>${statusHtml}</td>
            <td class="text-right">${fiveHText}</td>
            <td class="text-right">${weekText}</td>
            <td class="text-right text-mono">${speedText}</td>
            <td class="text-right text-mono">${tokensText}</td>
            <td class="text-left">${forecastHtml}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

// -----------------------------------------------------------------------------
// 8. Tab 3: 会话与模型账单渲染 (Sessions & Models)
// -----------------------------------------------------------------------------
function renderModelsAndSessionsTab(data) {
  const clients = data.clients || [];

  // 1. 汇总所有模型数据
  const modelAggregation = {};
  clients.forEach(c => {
    const byModel = c.usage?.byModel || {};
    Object.entries(byModel).forEach(([modelName, m]) => {
      if (!modelAggregation[modelName]) {
        modelAggregation[modelName] = { requests: 0, uncachedInput: 0, cacheRead: 0, output: 0, costUsd: 0 };
      }
      modelAggregation[modelName].requests += (m.requests || 0);
      modelAggregation[modelName].uncachedInput += (m.uncachedInput || 0);
      modelAggregation[modelName].cacheRead += (m.cacheRead || 0);
      modelAggregation[modelName].output += (m.output || 0);
      modelAggregation[modelName].costUsd += (m.costUsd || 0);
    });
  });

  const modelsTableBody = $('models-table-body');
  const modelEntries = Object.entries(modelAggregation);
  if (modelEntries.length === 0) {
    modelsTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${t('noModelData')}</td></tr>`;
  } else {
    modelsTableBody.innerHTML = modelEntries.map(([modelName, m]) => {
      const totalInput = m.uncachedInput + m.cacheRead;
      const hitRate = totalInput > 0 ? ((m.cacheRead / totalInput) * 100) : 0;
      return `
        <tr>
          <td><strong class="font-mono">${modelName}</strong></td>
          <td class="text-right font-mono">${formatNumber(m.requests)}</td>
          <td class="text-right font-mono">${formatNumber(m.uncachedInput, true)}</td>
          <td class="text-right font-mono text-success">${formatNumber(m.cacheRead, true)}</td>
          <td class="text-right font-mono">${formatNumber(m.output, true)}</td>
          <td class="text-right font-mono"><span class="badge" style="background:rgba(16,185,129,0.15);color:var(--color-success)">${formatPercent(hitRate)}</span></td>
          <td class="text-right font-mono"><strong>${formatUSD(m.costUsd)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // 2. 跨客户端最近会话列表
  const allSessions = [];
  clients.forEach(c => {
    const recent = c.usage?.recentSessions || [];
    recent.forEach(s => {
      allSessions.push({ ...s, clientName: c.name, clientId: c.id, clientRole: c.role });
    });
  });

  // 按更新时间降序
  allSessions.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  const filterKeyword = ($('session-search-input')?.value || '').trim().toLowerCase();
  const filteredSessions = filterKeyword ? allSessions.filter(s =>
    (s.title || '').toLowerCase().includes(filterKeyword) ||
    (s.id || '').toLowerCase().includes(filterKeyword) ||
    (s.primaryModel || '').toLowerCase().includes(filterKeyword) ||
    (s.clientName || '').toLowerCase().includes(filterKeyword)
  ) : allSessions;

  const sessionsTableBody = $('sessions-table-body');
  if (filteredSessions.length === 0) {
    sessionsTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">${t('noSessionData')}</td></tr>`;
  } else {
    sessionsTableBody.innerHTML = filteredSessions.slice(0, 50).map(s => {
      const isHeavy = (s.totalTokens && s.totalTokens > 100000) || (s.costUsd && s.costUsd > 0.05);
      const isMaster = s.clientRole === 'master';
      const clientBadgeClass = isMaster ? 'master-badge' : 'worker-badge';
      const billedTokens = s.uncachedInput + s.output;

      return `
        <tr>
          <td>
            <span class="badge ${clientBadgeClass}">${s.clientName}</span>
          </td>
          <td>
            <span class="font-mono" title="${s.title || s.id}">${s.title || s.id}</span>
            ${isHeavy ? `<span class="tag-heavy">${t('heavySessionTag')}</span>` : ''}
          </td>
          <td><span class="session-badge-model">${s.primaryModel || 'Gemini 3.8'}</span></td>
          <td class="text-right font-mono">${s.calls || s.steps || 1}</td>
          <td class="text-right font-mono">${formatNumber(billedTokens, true)}</td>
          <td class="text-right font-mono">${formatPercent(s.hitRate || 0)}</td>
          <td class="text-right font-mono"><strong>${formatUSD(s.costUsd || 0)}</strong></td>
          <td class="text-right">
            <button class="btn btn-secondary btn-sm btn-copy-id" data-id="${s.id}" title="复制会话 CascadeId">
              复制 ID
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // 绑定复制事件
    sessionsTableBody.querySelectorAll('.btn-copy-id').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.id).then(() => {
          const oldText = btn.textContent;
          btn.textContent = '已复制!';
          setTimeout(() => btn.textContent = oldText, 1500);
        });
      });
    });
  }
}

// -----------------------------------------------------------------------------
// 9. Tab 3: 智能派发台交互与提交
// -----------------------------------------------------------------------------
function renderDispatchClientCheckboxes(clients) {
  const container = $('dispatch-checkbox-grid');
  if (!container) return;

  const ultraClient = clients.find(c => c.id === 'ultra');
  const workers = clients.filter(c => c.role !== 'master');

  let html = '';
  if (ultraClient) {
    html += '<label class="client-chk-item client-chk-ultra">' +
      '<input type="checkbox" name="manual-client" value="ultra">' +
      '<span><strong>👑 0号 Ultra (交由 Argon 主控统筹拆解)</strong> (' + (ultraClient.online ? '在线' : '离线') + ')</span>' +
    '</label>';
  }

  html += workers.map(w => {
    const timeText = w.online && w.fiveHourResetText && w.fiveHourResetText !== '-' ? ' | ⏱️ ' + w.fiveHourResetText : '';
    const bonusText = w.online && w.timeBonus ? ' (' + (w.timeBonus > 0 ? '+' : '') + w.timeBonus + '分)' : '';
    const urgentTag = w.online && w.timeZone === 'urgent-burn' ? ' 🔥' : '';
    return '<label class="client-chk-item">' +
      '<input type="checkbox" name="manual-client" value="' + w.id + '" ' + (w.enabledForDispatch ? 'checked' : '') + '>' +
      '<span><strong>' + w.name + '</strong> (' + (w.online ? '在线' : '离线') + timeText + bonusText + urgentTag + ')</span>' +
    '</label>';
  }).join('');

  container.innerHTML = html;
}

let isDispatchModelsLoaded = false;
async function populateDispatchModels() {
  if (isDispatchModelsLoaded) return;
  const sel = $('dispatch-model-select');
  if (!sel) return;
  try {
    const data = await apiRequest('/api/chat/models?client=ultra');
    if (data && Array.isArray(data.modelFamilies) && data.modelFamilies.length > 0) {
      isDispatchModelsLoaded = true;
      const curVal = sel.value;
      let opts = '<option value="auto">⚙️ 跟随各客户端默认 (Auto)</option>';
      for (const fam of data.modelFamilies) {
        opts += `<option value="${escapeHtml(fam.family)}">${escapeHtml(fam.family)}</option>`;
      }
      sel.innerHTML = opts;
      if (curVal && Array.from(sel.options).some(o => o.value === curVal)) {
        sel.value = curVal;
      }
    }
  } catch (e) {
    console.warn('[app] 加载派发台模型列表失败:', e.message);
  }
}

// 智能任务规模评估 (严禁将普通 1. 2. 3. 序号误判为多机大工程！)
function estimateTaskScale(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { tier: 'Tier S/M', reason: '空或极短任务', isLarge: false, splitCount: 1 };
  }
  const text = prompt.trim();

  // 严格条件：必须包含明确的独立章节标题（如 ### 【子任务 1】、### 任务 1、### 模块一），且 >= 2 个独立章节
  const sectionMatches = text.match(/^[ \t]*#{1,4}\s*(?:【?(?:子任务|任务|模块)\s*[一二三四1234\d]+】?|【子任务\s*\d+】)/gm) || [];
  if (sectionMatches.length >= 2) {
    const estParts = Math.min(3, sectionMatches.length);
    return {
      tier: 'Tier L/XL',
      reason: '检测到 ' + sectionMatches.length + ' 个预先隔离的独立章节子任务标题',
      isLarge: true,
      splitCount: estParts
    };
  }

  return {
    tier: 'Tier S/M',
    reason: '未包含预先隔离的独立子任务章节标题，强制单机独立闭环',
    isLarge: false,
    splitCount: 1
  };
}

function updateScalePreview() {
  const promptInput = $('dispatch-prompt-input');
  const previewBox = $('scalePreviewBox');
  const autoRadio = document.querySelector('input[name="dispatch-mode"][value="auto"]');
  const isAutoMode = autoRadio ? autoRadio.checked : true;
  const autoSplitChecked = $('autoSplit')?.checked ?? true;

  if (!previewBox) return;

  if (!isAutoMode || !autoSplitChecked) {
    previewBox.style.display = 'none';
    return;
  }

  const val = promptInput?.value || '';
  if (val.trim().length < 15) {
    previewBox.style.display = 'none';
    return;
  }

  const scale = estimateTaskScale(val);
  previewBox.style.display = 'block';

  if (scale.isLarge) {
    previewBox.innerHTML = `
      <div class="scale-badge scale-large" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:rgba(147,51,234,0.15);border:1px solid rgba(147,51,234,0.4);color:#c084fc;font-size:12px;">
        <span style="font-size:14px;">🟣</span>
        <div>
          <strong>智能评估：【大型多模块工程 (预计 ${scale.splitCount} 个正交子模块)】</strong>
          <div style="font-size:11px;opacity:0.85;margin-top:2px;">将按剩余额度排行榜自动拆分为 ${scale.splitCount} 份并并发指派给 Top ${scale.splitCount} 台在线 Pro 节点！(${scale.reason})</div>
        </div>
      </div>
    `;
  } else {
    previewBox.innerHTML = `
      <div class="scale-badge scale-small" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:var(--color-success);font-size:12px;">
        <span style="font-size:14px;">🟢</span>
        <div>
          <strong>智能评估：【中小型单机任务 (预估 <600行)】</strong>
          <div style="font-size:11px;opacity:0.85;margin-top:2px;">将直接优选剩余额度第 1 的 Pro 节点独立闭环（避免多机拆单损耗）</div>
        </div>
      </div>
    `;
  }
}

async function handleDispatchSubmit() {
  if (isDispatching) return;
  const prompt = ($('dispatch-prompt-input')?.value || '').trim();
  if (!prompt) {
    alert(currentLang === 'zh' ? '请输入要派发的任务指令 Prompt！' : 'Please enter the task prompt!');
    $('dispatch-prompt-input')?.focus();
    return;
  }

  const mode = document.querySelector('input[name="dispatch-mode"]:checked')?.value || 'auto';
  let target = 'auto';

  if (mode === 'manual') {
    const checked = Array.from(document.querySelectorAll('input[name="manual-client"]:checked')).map(el => el.value);
    if (checked.length === 0) {
      alert(currentLang === 'zh' ? '请勾选至少一个执行目标客户端！' : 'Please select at least one target client!');
      return;
    }
    target = checked.length === 1 ? checked[0] : checked.join(',');
  }

  const forceNew = Boolean($('dispatch-opt-force-new')?.checked);
  const smartNew = Boolean($('smartNew')?.checked);
  const autoSplit = Boolean($('autoSplit')?.checked);
  const overdraftProtect = $('overdraftProtect') ? Boolean($('overdraftProtect').checked) : true;
  const callbackUltra = Boolean($('dispatch-opt-callback')?.checked);
  const selfTest = Boolean($('dispatch-opt-self-test')?.checked);
  const reviewClient = $('dispatch-opt-peer-review')?.checked ? 'auto' : '';
  const model = $('dispatch-model-select')?.value || '';
  const thinkingStrength = $('dispatch-strength-select')?.value || '';

  const submitBtn = $('btn-submit-dispatch');
  isDispatching = true;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner mini-icon"></div> <span>${t('dispatching')}</span>`;

  try {
    const res = await apiRequest('/api/dispatch', {
      method: 'POST',
      body: JSON.stringify({
        target,
        prompt,
        model: model && model !== 'auto' ? model : '',
        thinkingStrength: thinkingStrength && thinkingStrength !== 'auto' ? thinkingStrength : '',
        forceNew,
        smartNew,
        autoSplit,
        overdraftProtect,
        callbackUltra,
        selfTest,
        reviewClient
      })
    });

    // 渲染结果
    const resultBox = $('dispatch-result-box');
    resultBox.style.display = 'flex';
    $('dispatch-res-time').textContent = new Date().toLocaleTimeString();
    if (res.autoSplit) {
      $('dispatch-res-target').textContent = `舰队协同并发 (${res.parts?.length || res.splitCount} 节点: ${res.parts ? res.parts.map(p => p.Name).join(', ') : 'Top Pro 节点'})`;
      $('dispatch-res-cascade-id').textContent = res.parts ? res.parts.map(p => `${p.Target}: ${p.CascadeId}`).join(' | ') : '多机并发已派发';
      $('dispatch-res-reason').textContent = `🟣 大型多模块任务已按额度排行榜自动拆分为 ${res.splitCount} 份并分派`;
    } else {
      $('dispatch-res-target').textContent = res.target || target;
      $('dispatch-res-cascade-id').textContent = res.cascadeId || '已异步派发';
      $('dispatch-res-reason').textContent = res.reason || res.targetReason || (mode === 'auto' ? '由 AI 额度负载均衡引擎自动分配' : '手动勾选派发');
    }

    // 触发刷新
    fetchFleetData(false);
  } catch (err) {
    alert('派发失败: ' + err.message);
  } finally {
    isDispatching = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg class="icon"><use href="#icon-send"/></svg> <span>${t('btnSendDispatch')}</span>`;
  }
}

// -----------------------------------------------------------------------------
// 10. Tab 4: 客户端扩展管理 (+ 节点扩容)
// -----------------------------------------------------------------------------
function renderManageTab(clients) {
  const container = $('manage-nodes-list');
  if (!container) return;

  container.innerHTML = clients.map(client => {
    const isMaster = client.role === 'master';
    return `
      <div class="node-row-card">
        <div class="node-info-col">
          <span class="node-id-badge">${client.id}</span>
          <div class="node-main-details">
            <div class="node-name-line">
              <span>${client.name}</span>
              <span class="badge ${isMaster ? 'master-badge' : 'worker-badge'}">${client.role}</span>
              <span class="client-status-indicator ${client.online ? 'online' : 'offline'}">
                <span class="status-dot ${client.online ? 'live' : ''}"></span>
                <span>${client.online ? t('online') : t('offline')}</span>
              </span>
            </div>
            <div class="node-paths-line">
              <span>邮箱: ${client.email}</span>
              <span>Roaming: ${client.roamingDir || '—'}</span>
            </div>
          </div>
        </div>

        <div class="node-actions-col">
          ${!isMaster ? `
            <button class="btn btn-secondary btn-sm btn-remove-client text-danger" data-id="${client.id}" title="从注册表中注销该节点">
              <svg class="icon mini-icon"><use href="#icon-trash"/></svg>
              <span>移除</span>
            </button>
          ` : `
            <span class="badge master-badge">主控保护</span>
          `}
        </div>
      </div>
    `;
  }).join('');

  // 绑定移除事件
  container.querySelectorAll('.btn-remove-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const clientId = btn.dataset.id;
      if (!confirm(`确定要从舰队中移除客户端节点 [${clientId}] 吗？`)) return;
      try {
        await apiRequest('/api/clients', {
          method: 'POST',
          body: JSON.stringify({ action: 'remove', clientId })
        });
        fetchFleetData(false);
      } catch (err) {
        alert('移除失败: ' + err.message);
      }
    });
  });
}

// -----------------------------------------------------------------------------
// 11. 初始化与事件绑定
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await resolveRemoteConfig();
  // 1. 初始化国际化
  localizeUI();

  // 2. 语言切换按钮
  $('lang-btn')?.addEventListener('click', toggleLanguage);

  // 3. 刷新按钮
  $('refresh-btn')?.addEventListener('click', () => fetchFleetData(true));
  $('btn-sync-pricing')?.addEventListener('click', async () => {
    const btn = $('btn-sync-pricing');
    btn.classList.add('spinning');
    try {
      await apiRequest('/api/pricing/refresh', { method: 'POST' });
      await fetchFleetData(true);
    } catch (err) {
      console.warn('刷新价格失败', err);
    } finally {
      btn.classList.remove('spinning');
    }
  });

  // 4. 时间跨度按钮
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = btn.dataset.range;
      fetchFleetData(false);
    });
  });

  // 5. 标签页切换 (点击即刻触发渲染，零等待)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $(`pane-${targetTab}`)?.classList.add('active');

      // 即刻触发该 Tab 渲染，无需等待轮询
      if (targetTab === 'chat') {
        if (typeof window.initChatTerminal === 'function') window.initChatTerminal();
        if (typeof window.startChatPolling === 'function') window.startChatPolling();
      } else {
        if (typeof window.stopChatPolling === 'function') window.stopChatPolling();
      }

      if (latestFleetData) {
        if (targetTab === 'accounts') renderAccountsTab(latestFleetData);
        else if (targetTab === 'models') renderModelsAndSessionsTab(latestFleetData);
        else if (targetTab === 'fleet') renderFleetTab(latestFleetData.clients || []);
        else if (targetTab === 'dispatch') renderDispatchClientCheckboxes(latestFleetData.clients || []);
        else if (targetTab === 'manage') renderManageTab(latestFleetData.clients || []);
        else if (targetTab === 'chat' && typeof window.renderChatClientCapsules === 'function') {
          window.renderChatClientCapsules(latestFleetData.clients || []);
        }
      }
    });
  });

  // 5.5 开关变更实时推送到全局 dispatch_state.json
  const syncOptionIds = [
    'dispatch-opt-force-new',
    'smartNew',
    'autoSplit',
    'overdraftProtect',
    'dispatch-opt-self-test',
    'dispatch-opt-peer-review'
  ];
  syncOptionIds.forEach(id => {
    $(id)?.addEventListener('change', async () => {
      await pushActiveFlagsToServer();
    });
  });

  // 6. 舰队矩阵过滤器
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      if (latestFleetData) renderFleetTab(latestFleetData.clients || []);
    });
  });

  // 7. 会话搜索输入防抖
  $('session-search-input')?.addEventListener('input', () => {
    if (latestFleetData) renderModelsAndSessionsTab(latestFleetData);
  });

  // 8. 智能派发台交互
  $('btn-quick-select-rec')?.addEventListener('click', () => {
    document.querySelector('input[name="dispatch-mode"][value="auto"]').checked = true;
    document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
    document.querySelector('input[name="dispatch-mode"][value="auto"]').closest('.radio-card').classList.add('active');
    $('manual-clients-box').style.display = 'none';
  });

  document.querySelectorAll('input[name="dispatch-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
      e.target.closest('.radio-card').classList.add('active');
      $('manual-clients-box').style.display = e.target.value === 'manual' ? 'block' : 'none';
      updateScalePreview();
    });
  });

  // 任务规模评估与实时预览联动
  $('dispatch-prompt-input')?.addEventListener('input', updateScalePreview);
  $('autoSplit')?.addEventListener('change', updateScalePreview);

  // 快速提示词模板
  document.querySelectorAll('.chip-sm').forEach(chip => {
    chip.addEventListener('click', () => {
      const textarea = $('dispatch-prompt-input');
      if (textarea) {
        textarea.value = chip.dataset.prompt;
        updateScalePreview();
      }
    });
  });

  // 派发提交
  $('btn-submit-dispatch')?.addEventListener('click', handleDispatchSubmit);

  // 9. 新增客户端模态框
  const modal = $('add-client-modal');
  $('btn-open-add-modal')?.addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  $('btn-close-modal')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  $('btn-cancel-modal')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // 提交新增客户端表单
  $('form-add-client')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('input-client-id').value.trim();
    const name = $('input-client-name').value.trim();
    const email = $('input-client-email').value.trim();
    const role = $('input-client-role').value;
    const roamingDir = $('input-client-roaming').value.trim();
    const brainDir = $('input-client-brain').value.trim();
    const shortcutPath = $('input-client-shortcut').value.trim();
    const autoInit = $('chk-auto-init-profile').checked;

    try {
      await apiRequest('/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          action: autoInit ? 'create-profile' : 'add',
          client: {
            id, name, email, role, roamingDir, brainDir, shortcutPath,
            enabledForDispatch: true
          }
        })
      });
      alert(`客户端 [${name}] 注册扩容成功！`);
      modal.style.display = 'none';
      e.target.reset();
      fetchFleetData(true);
    } catch (err) {
      alert('注册扩容失败: ' + err.message);
    }
  });

  // 10. 开始首次拉取与轮询 (5 秒一次)
  fetchFleetData(true);
  pollTimer = setInterval(() => fetchFleetData(false), 5000);
});

// -----------------------------------------------------------------------------
// 12. 兜底初始化演示数据 (当后端还未完成连接或单机独立预览时使用)
// -----------------------------------------------------------------------------
function getFallbackFleetData() {
  return {
    serverTime: new Date().toISOString(),
    pricing: {
      source: 'Google AI Studio 官方官价 (阶梯费率)',
      updatedAt: new Date().toISOString()
    },
    totals: {
      totalTokens: 2548200,
      realBilledTokens: 248200,
      cacheReadTokens: 2300000,
      cacheHitRate: 90.3,
      uncachedInputTokens: 184000,
      outputTokens: 64200,
      estimatedCostUsd: 0.3820,
      realCostUsd: 0.0468,
      cacheSavedUsd: 0.3352,
      onlineCount: 6,
      totalClients: 6,
      recommendedTarget: 'pro3'
    },
    clients: [
      {
        id: 'ultra',
        name: '0号 (Ultra主力 · 总指挥)',
        role: 'master',
        email: 'tangsunny724@gmail.com',
        online: true,
        pid: 2480,
        enabledForDispatch: false,
        roamingDir: 'C:\\Users\\23656\\AppData\\Roaming\\Antigravity',
        brainDir: 'C:\\Users\\23656\\.gemini\\antigravity\\brain',
        loadScore: 100,
        quota: {
          fiveHour: { remaining: 0.96, countdownSec: 14200 },
          weekly: { remaining: 0.98, countdownSec: 420000 }
        },
        activeSession: {
          title: 'Fleet Radar 协同总调度',
          model: 'Gemini 3.8 Ultra',
          tps: 68.4,
          contextUsedTokens: 38200,
          contextMaxTokens: 1000000,
          rounds: 18
        },
        usage: {
          realBilledTokens: 84200,
          cacheReadTokens: 620000,
          realCostUsd: 0.0162,
          byModel: {
            'gemini-3.8-ultra': { requests: 12, uncachedInput: 52000, cacheRead: 450000, output: 21000, costUsd: 0.0142 }
          },
          recentSessions: [
            { id: '63a46ba7-ab1e-4697-89b1-07318e8408da', title: 'Fleet Radar 协同总控调度', primaryModel: 'gemini-3.8-ultra', uncachedInput: 52000, output: 21000, hitRate: 0.89, costUsd: 0.0142, calls: 18, updatedAt: new Date().toISOString() }
          ]
        }
      },
      {
        id: 'pro1',
        name: 'Pro 1号',
        role: 'worker',
        email: 'zhentang724@gmail.com',
        online: true,
        pid: 14220,
        enabledForDispatch: true,
        roamingDir: 'C:\\Users\\23656\\AppData\\Roaming\\Antigravity-Pro1',
        brainDir: 'C:\\Users\\23656\\.antigravity-multi\\pro1\\.gemini\\antigravity\\brain',
        loadScore: 92,
        quota: {
          fiveHour: { remaining: 0.88, countdownSec: 9200 },
          weekly: { remaining: 0.94, countdownSec: 380000 }
        },
        activeSession: {
          title: '后端引擎与采集器开发',
          model: 'Gemini 3.8 Flash',
          tps: 112.5,
          contextUsedTokens: 54100,
          contextMaxTokens: 1000000,
          rounds: 24
        },
        usage: {
          realBilledTokens: 62400,
          cacheReadTokens: 580000,
          realCostUsd: 0.0118,
          byModel: {
            'gemini-3.8-flash': { requests: 26, uncachedInput: 44000, cacheRead: 580000, output: 18400, costUsd: 0.0118 }
          },
          recentSessions: [
            { id: 'b8214fa1-01f2-498c-8512-42199ac20112', title: '后端引擎与采集器开发', primaryModel: 'gemini-3.8-flash', uncachedInput: 44000, output: 18400, hitRate: 0.92, costUsd: 0.0118, calls: 24, updatedAt: new Date().toISOString() }
          ]
        }
      },
      {
        id: 'pro2',
        name: 'Pro 2号',
        role: 'worker',
        email: 'geminiadmin66@gmail.com',
        online: true,
        pid: 8912,
        enabledForDispatch: true,
        roamingDir: 'C:\\Users\\23656\\AppData\\Roaming\\Antigravity-Pro2',
        brainDir: 'C:\\Users\\23656\\.antigravity-multi\\pro2\\.gemini\\antigravity\\brain',
        loadScore: 95,
        quota: {
          fiveHour: { remaining: 0.94, countdownSec: 12400 },
          weekly: { remaining: 0.96, countdownSec: 410000 }
        },
        activeSession: {
          title: '前端可视化面板开发',
          model: 'Gemini 3.8 Flash',
          tps: 124.2,
          contextUsedTokens: 42100,
          contextMaxTokens: 1000000,
          rounds: 15
        },
        usage: {
          realBilledTokens: 42100,
          cacheReadTokens: 490000,
          realCostUsd: 0.0084,
          byModel: {
            'gemini-3.8-flash': { requests: 18, uncachedInput: 31000, cacheRead: 490000, output: 11100, costUsd: 0.0084 }
          },
          recentSessions: [
            { id: 'c0d3e18f-2975-4197-8f54-29cc631341d6', title: '前端可视化面板开发', primaryModel: 'gemini-3.8-flash', uncachedInput: 31000, output: 11100, hitRate: 0.94, costUsd: 0.0084, calls: 15, updatedAt: new Date().toISOString() }
          ]
        }
      },
      {
        id: 'pro3',
        name: 'Pro 3号',
        role: 'worker',
        email: 'geminiadmin77@gmail.com',
        online: true,
        pid: 11420,
        enabledForDispatch: true,
        roamingDir: 'C:\\Users\\23656\\AppData\\Roaming\\Antigravity-Pro3',
        brainDir: 'C:\\Users\\23656\\.antigravity-multi\\pro3\\.gemini\\antigravity\\brain',
        loadScore: 99,
        quota: {
          fiveHour: { remaining: 0.98, countdownSec: 15600 },
          weekly: { remaining: 0.99, countdownSec: 460000 }
        },
        activeSession: {
          title: '就绪等待任务派发',
          model: 'Gemini 3.8 Flash',
          tps: 0,
          contextUsedTokens: 0,
          contextMaxTokens: 1000000,
          rounds: 0
        },
        usage: {
          realBilledTokens: 12400,
          cacheReadTokens: 180000,
          realCostUsd: 0.0024,
          byModel: {
            'gemini-3.8-flash': { requests: 4, uncachedInput: 9000, cacheRead: 180000, output: 3400, costUsd: 0.0024 }
          },
          recentSessions: []
        }
      },
      {
        id: 'pro4',
        name: 'Pro 4号',
        role: 'worker',
        email: 'geminiadmin67@gmail.com',
        online: true,
        pid: 16890,
        enabledForDispatch: true,
        roamingDir: 'C:\\Users\\23656\\AppData\\Roaming\\Antigravity-Pro4',
        brainDir: 'C:\\Users\\23656\\.antigravity-multi\\pro4\\.gemini\\antigravity\\brain',
        loadScore: 91,
        quota: {
          fiveHour: { remaining: 0.86, countdownSec: 8800 },
          weekly: { remaining: 0.92, countdownSec: 360000 }
        },
        activeSession: {
          title: '自动化集成测试任务',
          model: 'Gemini 3.8 Flash',
          tps: 98.6,
          contextUsedTokens: 29800,
          contextMaxTokens: 1000000,
          rounds: 8
        },
        usage: {
          realBilledTokens: 28500,
          cacheReadTokens: 240000,
          realCostUsd: 0.0048,
          byModel: {
            'gemini-3.8-flash': { requests: 10, uncachedInput: 22000, cacheRead: 240000, output: 6500, costUsd: 0.0048 }
          },
          recentSessions: []
        }
      },
      {
        id: 'pro5',
        name: 'Pro 5号',
        role: 'worker',
        email: 'KyousukeAnifowoshe.676@gmail.com',
        online: true,
        pid: 19410,
        enabledForDispatch: true,
        roamingDir: 'C:\\Users\\23656\\AppData\\Roaming\\Antigravity-Pro5',
        brainDir: 'C:\\Users\\23656\\.antigravity-multi\\pro5\\.gemini\\antigravity\\brain',
        loadScore: 94,
        quota: {
          fiveHour: { remaining: 0.92, countdownSec: 11200 },
          weekly: { remaining: 0.95, countdownSec: 395000 }
        },
        activeSession: {
          title: '就绪等待任务派发',
          model: 'Gemini 3.8 Flash',
          tps: 0,
          contextUsedTokens: 0,
          contextMaxTokens: 1000000,
          rounds: 0
        },
        usage: {
          realBilledTokens: 18600,
          cacheReadTokens: 190000,
          realCostUsd: 0.0032,
          byModel: {
            'gemini-3.8-flash': { requests: 6, uncachedInput: 15000, cacheRead: 190000, output: 3600, costUsd: 0.0032 }
          },
          recentSessions: []
        }
      }
    ]
  };
}
