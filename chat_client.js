/**
 * Antigravity Fleet Radar - 💬 远程对话终端 (Web Antigravity 前端)
 * 提供完整的跨进程会话实时浏览、实时消息流监控与远程发话功能
 */

(function () {
  'use strict';

  let activeChatClient = 'ultra';
  let activeCascadeId = null;
  let chatPollingTimer = null;
  let isChatSending = false;
  let isChatInitialized = false;
  let chatSessionsCache = [];
  const clientModelsMap = new Map();

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 45) return '刚刚';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
    return `${Math.floor(diffSec / 86400)}天前`;
  }

  function renderSimpleMarkdown(raw) {
    if (!raw) return '';
    let text = escapeHtml(raw);

    // 提取并保护代码块 ```lang\n ... ```
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre class="code-block"><code class="lang-${lang}">${code.trim()}</code></pre>`);
      return placeholder;
    });

    // 内联代码 `...`
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 加粗 **...**
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 链接 [text](url)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 引用 > ...
    text = text.replace(/^(?:&gt;|>) (.*)$/gm, '<blockquote>$1</blockquote>');

    // 普通换行转 <br>
    text = text.replace(/\r?\n/g, '<br>');

    // 还原代码块
    codeBlocks.forEach((block, idx) => {
      text = text.replace(`__CODE_BLOCK_${idx}__`, block);
    });

    return text;
  }

  function getApiRequest() {
    if (typeof window.apiRequest === 'function') {
      return window.apiRequest;
    }
    // Fallback apiRequest
    return async (path, options = {}) => {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      return await res.json();
    };
  }

  function showChatToast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    console.log('[Chat Toast]', msg);
  }

  async function loadClientModels(clientId) {
    const modelSelect = $('chat-model-select');
    const strengthSelect = $('chat-strength-select');
    if (!modelSelect || !strengthSelect) return;

    const apiRequest = getApiRequest();
    let data = clientModelsMap.get(clientId);

    if (!data) {
      try {
        data = await apiRequest(`/api/chat/models?client=${clientId}`);
        if (data && Array.isArray(data.modelFamilies)) {
          clientModelsMap.set(clientId, data);
        }
      } catch (e) {
        console.warn('[chat_client] 获取模型列表失败:', e.message);
      }
    }

    if (!data || !Array.isArray(data.modelFamilies)) {
      data = {
        client: clientId,
        currentDefaultFamily: clientId === 'ultra' ? 'Gemini 4 Argon' : 'Gemini 3.8 Flash',
        currentDefaultStrength: clientId === 'ultra' ? 'medium' : 'high',
        modelFamilies: [
          { family: 'Gemini 4 Argon', variants: { default: 'MODEL_PLACEHOLDER_M418', low: 'MODEL_PLACEHOLDER_M419', medium: 'MODEL_PLACEHOLDER_M418', high: 'MODEL_PLACEHOLDER_M417' } },
          { family: 'Gemini 3.8 Flash', variants: { default: 'MODEL_PLACEHOLDER_M318', low: 'MODEL_PLACEHOLDER_M320', medium: 'MODEL_PLACEHOLDER_M319', high: 'MODEL_PLACEHOLDER_M318' } }
        ]
      };
    }

    // 填充模型下拉选项
    const defaultFamilyName = data.currentDefaultFamily || '客户端默认';
    const savedModel = localStorage.getItem(`antigravity_radar_model_${clientId}`);
    const savedStrength = localStorage.getItem(`antigravity_radar_strength_${clientId}`);

    let modelOptions = `<option value="auto">⚙️ 跟随客户端默认 (${escapeHtml(defaultFamilyName)})</option>`;
    for (const fam of data.modelFamilies) {
      modelOptions += `<option value="${escapeHtml(fam.family)}">${escapeHtml(fam.family)}</option>`;
    }
    modelSelect.innerHTML = modelOptions;

    if (savedModel && Array.from(modelSelect.options).some(o => o.value === savedModel)) {
      modelSelect.value = savedModel;
    } else {
      modelSelect.value = 'auto';
    }

    if (savedStrength && Array.from(strengthSelect.options).some(o => o.value === savedStrength)) {
      strengthSelect.value = savedStrength;
    } else {
      strengthSelect.value = 'auto';
    }

    updateActiveModelIndicator();
  }

  function updateActiveModelIndicator() {
    const modelSelect = $('chat-model-select');
    const strengthSelect = $('chat-strength-select');
    const activeTextEl = $('chat-active-model-text');
    if (!modelSelect || !strengthSelect || !activeTextEl) return;

    const selModel = modelSelect.value || 'auto';
    const selStrength = strengthSelect.value || 'auto';
    const data = clientModelsMap.get(activeChatClient);

    // 保存偏好到 localStorage
    try {
      localStorage.setItem(`antigravity_radar_model_${activeChatClient}`, selModel);
      localStorage.setItem(`antigravity_radar_strength_${activeChatClient}`, selStrength);
    } catch {}

    const targetFamilyName = (selModel === 'auto') ? (data?.currentDefaultFamily || 'Gemini 3.8 Flash') : selModel;
    const fam = data?.modelFamilies?.find(f => f.family.toLowerCase() === targetFamilyName.toLowerCase());

    let displayModelName = targetFamilyName;
    if (fam) {
      if (selStrength === 'low' && fam.variants.low) {
        displayModelName = `${fam.family} (Low)`;
      } else if (selStrength === 'high' && fam.variants.high) {
        displayModelName = `${fam.family} (High)`;
      } else if (selStrength === 'medium' && fam.variants.medium) {
        displayModelName = `${fam.family} (Medium)`;
      } else if (selStrength === 'auto') {
        const defaultStrength = (selModel === 'auto') ? data?.currentDefaultStrength : 'default';
        if (defaultStrength && defaultStrength !== 'default') {
          displayModelName = `${fam.family} (${defaultStrength.charAt(0).toUpperCase() + defaultStrength.slice(1)})`;
        } else {
          displayModelName = fam.family;
        }
      } else {
        displayModelName = `${fam.family} (${selStrength})`;
      }
    } else {
      displayModelName = targetFamilyName;
    }

    activeTextEl.textContent = displayModelName;
  }

  function initChatTerminal() {
    if (isChatInitialized) return;
    isChatInitialized = true;

    // 1. 发送按钮
    $('chat-btn-send')?.addEventListener('click', sendChatMessage);

    // 2. 输入框快捷键 (Enter 发送，Shift+Enter 换行)
    $('chat-composer-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    // 3. 模型与思考强度下拉联动
    $('chat-model-select')?.addEventListener('change', updateActiveModelIndicator);
    $('chat-strength-select')?.addEventListener('change', updateActiveModelIndicator);

    // 4. 移动端抽屉开关
    $('chat-btn-toggle-sidebar')?.addEventListener('click', () => {
      $('chat-sidebar')?.classList.toggle('mobile-open');
    });

    // 5. 刷新会话列表按钮
    $('chat-btn-refresh-list')?.addEventListener('click', () => {
      loadChatSessions(activeChatClient, false);
    });

    // 6. 新建会话按钮
    $('chat-btn-new-session')?.addEventListener('click', () => {
      startNewChatSession();
    });

    // 7. 点击复制 CascadeId 短码
    $('chat-cur-cascade-id')?.addEventListener('click', () => {
      if (activeCascadeId) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(activeCascadeId).then(() => {
            showChatToast('已复制完整 CascadeId: ' + activeCascadeId);
          });
        }
      }
    });

    // 8. 初始化客户端胶囊与载入 0号 Ultra 会话
    const clients = window.latestFleetData?.clients || [
      { id: 'ultra', name: '0号 (Ultra主力 · 总指挥)', role: 'master', online: true },
      { id: 'pro1', name: 'Pro 1号', role: 'worker', online: true },
      { id: 'pro2', name: 'Pro 2号', role: 'worker', online: true },
      { id: 'pro3', name: 'Pro 3号', role: 'worker', online: true },
      { id: 'pro4', name: 'Pro 4号', role: 'worker', online: true }
    ];
    renderChatClientCapsules(clients);
    loadClientModels(activeChatClient);
    loadChatSessions(activeChatClient, true);
  }

  function renderChatClientCapsules(clients) {
    const container = $('chat-client-capsules');
    if (!container) return;

    const ultraClient = clients.find(c => c.id === 'ultra') || { id: 'ultra', name: '0号 (Ultra主力)', role: 'master', online: true };
    const workers = clients.filter(c => c.role !== 'master');
    const allList = [ultraClient, ...workers];

    container.innerHTML = allList.map(c => {
      const isUltra = c.id === 'ultra';
      const isActive = c.id === activeChatClient;
      const isOnline = Boolean(c.online);
      const label = isUltra ? '👑 0号 Ultra (Argon 主控)' : (c.name || c.id);

      return `
        <button class="client-capsule ${isUltra ? 'ultra' : ''} ${isActive ? 'active' : ''}" data-client-id="${c.id}">
          <span class="node-dot ${isOnline ? 'online' : 'offline'}"></span>
          <span>${label}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.client-capsule').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.clientId;
        if (cid === activeChatClient) return;
        activeChatClient = cid;
        renderChatClientCapsules(clients);
        loadClientModels(activeChatClient);
        loadChatSessions(activeChatClient, true);
      });
    });
  }

  async function loadChatSessions(clientId, autoSelectFirst = false) {
    const listContainer = $('chat-sessions-list');
    if (!listContainer) return;

    const apiRequest = getApiRequest();
    try {
      const data = await apiRequest(`/api/chat/list?client=${clientId}`);
      const sessions = data?.sessions || [];
      chatSessionsCache = sessions;

      if (sessions.length === 0) {
        listContainer.innerHTML = '<div class="chat-empty-hint">暂无历史会话记录<br><small style="color:var(--text-subtle);">点击上方 ➕ 新建会话</small></div>';
        if (autoSelectFirst) {
          startNewChatSession();
        }
        return;
      }

      listContainer.innerHTML = sessions.map(s => {
        const isActive = s.cascadeId === activeCascadeId;
        const statusIcon = s.isRunning ? '<span class="status-dot live"></span><span style="color:#34d399;">运行中</span>' : `⚪ ${s.stepCount}步`;
        const timeStr = timeAgo(s.updatedAt);

        return `
          <div class="chat-session-item ${isActive ? 'active' : ''}" data-cascade-id="${s.cascadeId}">
            <div class="session-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</div>
            <div class="session-meta">
              <span class="session-status-tag">${statusIcon}</span>
              <span>${timeStr}</span>
            </div>
            ${s.lastPreview ? `<div class="session-preview">${escapeHtml(s.lastPreview)}</div>` : ''}
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll('.chat-session-item').forEach(item => {
        item.addEventListener('click', () => {
          const cid = item.dataset.cascadeId;
          const targetSession = sessions.find(x => x.cascadeId === cid);
          selectChatSession(cid, targetSession?.title || '会话详情');
        });
      });

      if (autoSelectFirst && sessions.length > 0) {
        selectChatSession(sessions[0].cascadeId, sessions[0].title);
      }
    } catch (err) {
      listContainer.innerHTML = `<div class="chat-empty-hint text-danger">加载失败: ${escapeHtml(err.message)}</div>`;
    }
  }

  function selectChatSession(cascadeId, title) {
    activeCascadeId = cascadeId;
    $('chat-sidebar')?.classList.remove('mobile-open');

    // 更新列表选中态
    document.querySelectorAll('.chat-session-item').forEach(el => {
      if (el.dataset.cascadeId === cascadeId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // 更新视口顶部状态
    const isUltra = activeChatClient === 'ultra';
    const clientBadge = $('chat-cur-client-badge');
    if (clientBadge) {
      clientBadge.textContent = isUltra ? '👑 0号 Ultra (Argon)' : `⚡ ${activeChatClient.toUpperCase()}`;
      clientBadge.className = `client-badge ${isUltra ? 'ultra' : ''}`;
    }

    const titleEl = $('chat-cur-session-title');
    if (titleEl) titleEl.textContent = title || '会话详情';

    const cidEl = $('chat-cur-cascade-id');
    if (cidEl) {
      cidEl.textContent = cascadeId ? `ID: ${cascadeId.substring(0, 8)}...` : '';
      cidEl.title = cascadeId ? `完整 CascadeId: ${cascadeId} (点击复制)` : '';
    }

    loadChatMessages(activeChatClient, cascadeId);
  }

  function startNewChatSession() {
    activeCascadeId = '';
    document.querySelectorAll('.chat-session-item').forEach(el => el.classList.remove('active'));

    const isUltra = activeChatClient === 'ultra';
    const clientBadge = $('chat-cur-client-badge');
    if (clientBadge) {
      clientBadge.textContent = isUltra ? '👑 0号 Ultra (Argon)' : `⚡ ${activeChatClient.toUpperCase()}`;
      clientBadge.className = `client-badge ${isUltra ? 'ultra' : ''}`;
    }

    $('chat-cur-session-title').textContent = '➕ 全新会话模式';
    $('chat-cur-cascade-id').textContent = 'NEW';
    $('chat-cur-status-badge').textContent = '⚪ 待启动';
    $('chat-cur-status-badge').className = 'badge';

    const container = $('chat-messages-container');
    if (container) {
      container.innerHTML = `
        <div class="chat-empty-hint">
          <div style="font-size:28px;margin-bottom:10px;">💬</div>
          <strong>已准备好新会话！</strong><br>
          <span style="color:var(--text-subtle);">在下方输入框中键入任何任务或代码指令，发送后将立即为该客户端创建新会话。</span>
        </div>
      `;
    }
    $('chat-running-bar').style.display = 'none';
    $('chat-composer-input')?.focus();
  }

  async function loadChatMessages(clientId, cascadeId) {
    if (!cascadeId) return;
    const container = $('chat-messages-container');
    if (!container) return;

    const apiRequest = getApiRequest();
    try {
      const data = await apiRequest(`/api/chat/messages?client=${clientId}&cascadeId=${cascadeId}&limit=80`);
      const messages = data?.messages || [];

      // 更新状态徽章
      const statusBadge = $('chat-cur-status-badge');
      const runningBar = $('chat-running-bar');
      if (data?.model) {
        const activeTextEl = $('chat-active-model-text');
        if (activeTextEl) activeTextEl.textContent = data.model;
      }
      if (data?.isRunning) {
        if (statusBadge) {
          statusBadge.textContent = '🟢 思考/执行中';
          statusBadge.className = 'badge badge-success';
        }
        if (runningBar) runningBar.style.display = 'flex';
      } else {
        if (statusBadge) {
          statusBadge.textContent = '⚪ 空闲就绪';
          statusBadge.className = 'badge';
        }
        if (runningBar) runningBar.style.display = 'none';
      }

      if (messages.length === 0) {
        container.innerHTML = '<div class="chat-empty-hint">暂无对话内容</div>';
        return;
      }

      const html = messages.map(msg => {
        const isUser = msg.role === 'user';
        if (isUser) {
          let noticeHtml = '';
          if (msg.systemNotice) {
            noticeHtml = `
              <details class="user-notice-toggle">
                <summary>📎 协同汇报注入后缀 (已折叠)</summary>
                <pre>${escapeHtml(msg.systemNotice)}</pre>
              </details>
            `;
          }
          return `
            <div class="chat-msg-row user-row">
              <div class="chat-bubble user-bubble">
                <div class="markdown-body">${renderSimpleMarkdown(msg.content)}</div>
                ${noticeHtml}
              </div>
            </div>
          `;
        } else {
          let thinkingHtml = '';
          if (msg.thinking) {
            thinkingHtml = `
              <details class="thinking-box">
                <summary>💭 查看思考过程</summary>
                <div class="thinking-content">${escapeHtml(msg.thinking)}</div>
              </details>
            `;
          }

          let toolsHtml = '';
          if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            toolsHtml = `
              <div class="tool-calls-grid">
                ${msg.toolCalls.map(t => {
                  const summaryText = t.summary ? (t.summary.length > 35 ? t.summary.substring(0, 35) + '...' : t.summary) : '';
                  return `<span class="tool-capsule" title="${escapeHtml(t.summary)}">🛠️ <strong>${escapeHtml(t.name)}</strong> ${escapeHtml(summaryText)}</span>`;
                }).join('')}
              </div>
            `;
          }

          return `
            <div class="chat-msg-row assistant-row">
              <div class="chat-bubble assistant-bubble">
                ${thinkingHtml}
                ${toolsHtml}
                <div class="markdown-body">${renderSimpleMarkdown(msg.content)}</div>
              </div>
            </div>
          `;
        }
      }).join('');

      container.innerHTML = html;
      container.scrollTop = container.scrollHeight;
    } catch (err) {
      console.warn('[chat] 加载消息流异常:', err.message);
    }
  }

  async function sendChatMessage() {
    const inputEl = $('chat-composer-input');
    if (!inputEl || isChatSending) return;

    const prompt = inputEl.value.trim();
    if (!prompt) return;

    isChatSending = true;
    inputEl.value = '';

    const container = $('chat-messages-container');
    const runningBar = $('chat-running-bar');

    // 乐观插入用户气泡
    if (container) {
      const optimisticRow = document.createElement('div');
      optimisticRow.className = 'chat-msg-row user-row';
      optimisticRow.innerHTML = `
        <div class="chat-bubble user-bubble">
          <div class="markdown-body">${renderSimpleMarkdown(prompt)}</div>
        </div>
      `;
      container.appendChild(optimisticRow);
      container.scrollTop = container.scrollHeight;
    }
    if (runningBar) runningBar.style.display = 'flex';
    $('chat-cur-status-badge').textContent = '🟢 思考/执行中';
    $('chat-cur-status-badge').className = 'badge badge-success';

    const apiRequest = getApiRequest();
    const selModel = $('chat-model-select')?.value || 'auto';
    const selStrength = $('chat-strength-select')?.value || 'auto';

    try {
      const res = await apiRequest('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          client: activeChatClient,
          cascadeId: activeCascadeId || '',
          prompt: prompt,
          model: selModel !== 'auto' ? selModel : '',
          thinkingStrength: selStrength !== 'auto' ? selStrength : '',
        })
      });

      if (res?.success) {
        if (res.cascadeId && res.cascadeId !== activeCascadeId) {
          activeCascadeId = res.cascadeId;
          // 刷新列表并选定新会话
          await loadChatSessions(activeChatClient, false);
          selectChatSession(activeCascadeId, prompt.substring(0, 30));
        } else {
          // 等待 1.5 秒后拉取最新更新
          setTimeout(() => {
            loadChatMessages(activeChatClient, activeCascadeId);
          }, 1500);
        }
      } else {
        showChatToast('发送失败: ' + (res?.error || '未知错误'));
      }
    } catch (err) {
      showChatToast('发送失败: ' + err.message);
    } finally {
      isChatSending = false;
    }
  }

  function startChatPolling() {
    stopChatPolling();
    chatPollingTimer = setInterval(async () => {
      if (activeCascadeId) {
        try {
          await loadChatMessages(activeChatClient, activeCascadeId);
        } catch {}
      }
    }, 3000);
  }

  function stopChatPolling() {
    if (chatPollingTimer) {
      clearInterval(chatPollingTimer);
      chatPollingTimer = null;
    }
  }

  // 暴露给全局 window 供 Tab 切换和外部联动
  window.initChatTerminal = initChatTerminal;
  window.renderChatClientCapsules = renderChatClientCapsules;
  window.startChatPolling = startChatPolling;
  window.stopChatPolling = stopChatPolling;
})();
