// ==UserScript==
// @name         自动学习助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动处理视频播放和课程导航
// @author       E7G
// @match        https://mooc1.chaoxing.com/mycourse/studentstudy*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // 配置参数
    const CONFIG = {
        checkInterval: 2000,    // 检测间隔（毫秒）
        videoStuckTime: 5000,   // 视频卡住时间阈值
        debug: true,            // 调试模式
        maxConsecutiveNoButton: 3, // 连续找不到下一节按钮的最大次数
        enableVideoStuckCheck: true, // 是否启用视频防卡住功能
        enableAutoNext: true    // 是否启用自动下一行功能
    };
    
    // 全局状态
    let state = {
        consecutiveNoButtonCount: 0,  // 连续找不到下一节按钮的次数
        isLastSection: false          // 是否为最后一节
    };
    
    // 日志函数
    function log(message) {
        if (CONFIG.debug) {
            console.log(`[自动学习助手] ${message}`);
        }
    }
    
    // 获取视频元素（支持iframe嵌套）
    function getVideoElement() {
        // 先在主文档中查找
        let video = document.querySelector('video#video_html5_api.vjs-tech');
        if (video) {
            log('在主文档中找到视频元素');
            return video;
        }
        
        // 在所有同源iframe中递归查找
        const iframes = document.querySelectorAll('iframe');
        log(`扫描 ${iframes.length} 个iframe中的视频元素...`);
        
        for (let i = 0; i < iframes.length; i++) {
            try {
                const iframe = iframes[i];
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                
                if (iframeDoc) {
                    video = iframeDoc.querySelector('video#video_html5_api.vjs-tech');
                    if (video) {
                        log(`在iframe[${i}]中找到视频元素 (src: ${iframe.src || '无src'})`);
                        return video;
                    }
                    
                    // 递归查找嵌套iframe
                    const nestedIframes = iframeDoc.querySelectorAll('iframe');
                    for (let j = 0; j < nestedIframes.length; j++) {
                        try {
                            const nestedIframe = nestedIframes[j];
                            const nestedDoc = nestedIframe.contentDocument || nestedIframe.contentWindow?.document;
                            
                            if (nestedDoc) {
                                video = nestedDoc.querySelector('video#video_html5_api.vjs-tech');
                                if (video) {
                                    log(`在嵌套iframe[${i}][${j}]中找到视频元素 (src: ${nestedIframe.src || '无src'})`);
                                    return video;
                                }
                            }
                        } catch (e) {
                            log(`访问嵌套iframe[${i}][${j}]失败: ${e.message}`);
                        }
                    }
                }
            } catch (e) {
                log(`访问iframe[${i}]失败: ${e.message}`);
            }
        }
        
        log('未在任何文档中找到视频元素');
        return null;
    }
    
    // 获取任务点元素（支持iframe嵌套）
    function getTaskElement() {
        // 先在主文档中查找
        let taskElement = findTaskElementInDocument(document);
        if (taskElement) {
            return taskElement;
        }
        
        // 在所有同源iframe中递归查找
        const iframes = document.querySelectorAll('iframe');
        log(`扫描 ${iframes.length} 个iframe中的任务点元素...`);
        
        for (let i = 0; i < iframes.length; i++) {
            try {
                const iframe = iframes[i];
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                
                if (iframeDoc) {
                    taskElement = findTaskElementInDocument(iframeDoc);
                    if (taskElement) {
                        log(`在iframe[${i}]中找到任务点元素 (src: ${iframe.src || '无src'})`);
                        return taskElement;
                    }
                    
                    // 递归查找嵌套iframe
                    const nestedIframes = iframeDoc.querySelectorAll('iframe');
                    for (let j = 0; j < nestedIframes.length; j++) {
                        try {
                            const nestedIframe = nestedIframes[j];
                            const nestedDoc = nestedIframe.contentDocument || nestedIframe.contentWindow?.document;
                            
                            if (nestedDoc) {
                                taskElement = findTaskElementInDocument(nestedDoc);
                                if (taskElement) {
                                    log(`在嵌套iframe[${i}][${j}]中找到任务点元素 (src: ${nestedIframe.src || '无src'})`);
                                    return taskElement;
                                }
                            }
                        } catch (e) {
                            log(`访问嵌套iframe[${i}][${j}]失败: ${e.message}`);
                        }
                    }
                }
            } catch (e) {
                log(`访问iframe[${i}]失败: ${e.message}`);
            }
        }
        
        log('未在任何文档中找到任务点元素');
        return null;
    }
    
    // 在单个文档中查找任务点元素
    function findTaskElementInDocument(doc) {
        // 首先尝试精确匹配你提供的结构
        const exactMatch = doc.querySelector('div.ans-job-icon.ans-job-icon-clear[aria-label*="任务点"]');
        if (exactMatch) {
            log(`在文档中找到任务点元素 (精确选择器): class="${exactMatch.className}", aria-label="${exactMatch.getAttribute('aria-label')}", id="${exactMatch.id}"`);
            return exactMatch;
        }
        
        // 尝试属性选择器（最可靠的方式）
        const byAriaLabel = doc.querySelector('[aria-label*="任务点未完成"], [aria-label*="任务点已完成"]');
        if (byAriaLabel) {
            log(`在文档中通过aria-label找到任务点元素: class="${byAriaLabel.className}", aria-label="${byAriaLabel.getAttribute('aria-label')}", id="${byAriaLabel.id}"`);
            return byAriaLabel;
        }
        
        // 尝试class包含匹配
        const byClass = doc.querySelector('[class*="ans-job-icon"]');
        if (byClass && byClass.getAttribute('aria-label') && byClass.getAttribute('aria-label').includes('任务点')) {
            log(`在文档中通过class找到任务点元素: class="${byClass.className}", aria-label="${byClass.getAttribute('aria-label')}", id="${byClass.id}"`);
            return byClass;
        }
        
        // 如果没找到，列出文档中所有相关元素进行对比
        log('在文档中未找到任务点元素，扫描所有相关元素...');
        
        const allJobIcons = doc.querySelectorAll('[class*="ans-job"]');
        log(`在文档中找到 ${allJobIcons.length} 个包含 "ans-job" 的元素:`);
        allJobIcons.forEach((icon, index) => {
            const ariaLabel = icon.getAttribute('aria-label');
            log(`  [${index}] tag="${icon.tagName}", class="${icon.className}", aria-label="${ariaLabel}", id="${icon.id}"`);
        });
        
        // 扫描所有有aria-label的元素
        const allLabeled = doc.querySelectorAll('[aria-label]');
        log(`在文档中找到 ${allLabeled.length} 个有 aria-label 的元素:`);
        allLabeled.forEach((el, index) => {
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.includes('任务点')) {
                log(`  [任务点] tag="${el.tagName}", class="${el.className}", aria-label="${ariaLabel}", id="${el.id}"`);
            }
        });
        
        return null;
    }
    
    // 查找下一节按钮（支持iframe嵌套）
    function getNextButton() {
        // 如果已经判断为最后一节，直接返回null
        if (state.isLastSection) {
            log('已判断为最后一节，跳过下一节按钮查找');
            return null;
        }
        
        // 先在主文档中查找
        let button = findNextButtonInDocument(document);
        if (button) {
            return button;
        }
        
        // 在所有同源iframe中递归查找
        const iframes = document.querySelectorAll('iframe');
        log(`扫描 ${iframes.length} 个iframe中的下一节按钮...`);
        
        for (let i = 0; i < iframes.length; i++) {
            try {
                const iframe = iframes[i];
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                
                if (iframeDoc) {
                    button = findNextButtonInDocument(iframeDoc);
                    if (button) {
                        log(`在iframe[${i}]中找到下一节按钮 (src: ${iframe.src || '无src'})`);
                        return button;
                    }
                    
                    // 递归查找嵌套iframe
                    const nestedIframes = iframeDoc.querySelectorAll('iframe');
                    for (let j = 0; j < nestedIframes.length; j++) {
                        try {
                            const nestedIframe = nestedIframes[j];
                            const nestedDoc = nestedIframe.contentDocument || nestedIframe.contentWindow?.document;
                            
                            if (nestedDoc) {
                                button = findNextButtonInDocument(nestedDoc);
                                if (button) {
                                    log(`在嵌套iframe[${i}][${j}]中找到下一节按钮 (src: ${nestedIframe.src || '无src'})`);
                                    return button;
                                }
                            }
                        } catch (e) {
                            log(`访问嵌套iframe[${i}][${j}]失败: ${e.message}`);
                        }
                    }
                }
            } catch (e) {
                log(`访问iframe[${i}]失败: ${e.message}`);
            }
        }
        
        log('未在任何文档中找到可见的下一节按钮');
        return null;
    }
    
    // 在单个文档中查找下一节按钮
    function findNextButtonInDocument(doc) {
        const selectors = [
            'button:contains("下一节")',
            'button:contains("继续学习")',
            '.next-btn',
            '[class*="next"]',
            'button[aria-label*="下一节"]',
            'button[title*="下一节"]',
            '#prevNextFocusNext' // 你提供的具体ID
        ];
        
        for (let selector of selectors) {
            try {
                let element;
                if (selector.includes(':contains')) {
                    // 手动实现 :contains 选择器
                    const text = selector.match(/:contains\("([^"]+)"\)/)[1];
                    const allButtons = doc.querySelectorAll('button');
                    element = Array.from(allButtons).find(btn => btn.textContent.includes(text));
                } else {
                    element = doc.querySelector(selector);
                }
                
                if (element) {
                    // 检查元素是否可见
                    const isVisible = element.offsetParent !== null && 
                                    window.getComputedStyle(element).display !== 'none' &&
                                    window.getComputedStyle(element).visibility !== 'hidden';
                    
                    if (isVisible) {
                        log(`在文档中找到可见的下一节按钮: ${selector}`);
                        return element;
                    } else {
                        log(`在文档中找到下一节按钮但元素被隐藏: ${selector}, display=${window.getComputedStyle(element).display}, visibility=${window.getComputedStyle(element).visibility}`);
                        // 继续查找其他选择器，不立即返回
                    }
                }
            } catch (e) {
                log(`在文档中查找按钮选择器 "${selector}" 失败: ${e.message}`);
            }
        }
        
        log('在文档中未找到可见的下一节按钮');
        return null;
    }
    
    // 检测视频是否卡住
    function isVideoStuck(video) {
        if (!video) {
            log('视频元素不存在，跳过卡住检测');
            return false;
        }
        
        const currentTime = video.currentTime;
        const duration = video.duration;
        const paused = video.paused;
        
        log(`视频状态检测: currentTime=${currentTime.toFixed(2)}, duration=${duration.toFixed(2)}, paused=${paused}, _lastTime=${(video._lastTime || 0).toFixed(2)}`);
        
        // 如果视频在播放但时间没变化，认为卡住了
        if (!paused && currentTime > 0 && currentTime < duration - 1) {
            log(`视频正在播放且未到结尾，检查是否卡住...`);
            
            if (video._lastTime === currentTime) {
                log(`视频时间未变化，可能卡住 (${currentTime.toFixed(2)})`);
                if (!video._stuckStartTime) {
                    video._stuckStartTime = Date.now();
                    log(`开始记录卡住时间: ${new Date(video._stuckStartTime).toLocaleTimeString()}`);
                } else {
                    const stuckDuration = Date.now() - video._stuckStartTime;
                    log(`已卡住 ${stuckDuration}ms，阈值 ${CONFIG.videoStuckTime}ms`);
                    if (stuckDuration > CONFIG.videoStuckTime) {
                        log(`视频确认卡住！持续时间超过阈值`);
                        return true;
                    }
                }
            } else {
                if (video._stuckStartTime) {
                    log(`视频时间已变化: ${(video._lastTime || 0).toFixed(2)} -> ${currentTime.toFixed(2)}，重置卡住检测`);
                } else {
                    log(`视频正常播放，时间从 ${(video._lastTime || 0).toFixed(2)} 到 ${currentTime.toFixed(2)}`);
                }
                video._lastTime = currentTime;
                video._stuckStartTime = null;
            }
        } else {
            if (paused) {
                log(`视频已暂停，跳过卡住检测`);
            } else if (currentTime <= 0) {
                log(`视频尚未开始播放 (currentTime=${currentTime.toFixed(2)})，跳过卡住检测`);
            } else if (currentTime >= duration - 1) {
                log(`视频已接近结尾 (currentTime=${currentTime.toFixed(2)}/${duration.toFixed(2)})，跳过卡住检测`);
            }
            // 重置状态
            video._lastTime = currentTime;
            video._stuckStartTime = null;
        }
        
        return false;
    }
    
    // 点击进度条最后位置
    function clickProgressEnd(video) {
        if (!video) {
            log('视频元素不存在，无法跳转');
            return;
        }
        
        const duration = video.duration;
        const currentTime = video.currentTime;
        
        log(`尝试跳转到视频结尾: currentTime=${currentTime.toFixed(2)} -> duration=${duration.toFixed(2)}`);
        
        if (duration > 0) {
            try {
                // 直接设置currentTime到接近结尾
                video.currentTime = duration - 0.1;
                log(`已跳转到视频结尾: ${(duration - 0.1).toFixed(2)}`);
                
                // 验证跳转是否成功
                setTimeout(() => {
                    const newTime = video.currentTime;
                    log(`跳转验证: 新时间=${newTime.toFixed(2)}，目标=${(duration - 0.1).toFixed(2)}`);
                    if (Math.abs(newTime - (duration - 0.1)) < 0.5) {
                        log('跳转成功！');
                    } else {
                        log('跳转可能失败，时间未达到目标位置');
                    }
                }, 500);
            } catch (error) {
                log(`跳转失败: ${error.message}`);
            }
        } else {
            log('视频时长无效，无法跳转');
        }
    }
    
    // 检查任务点状态
    function isTaskCompleted(taskElement) {
        if (!taskElement) {
            log('任务点元素不存在，视为已完成');
            return true; // 不存在视为已完成
        }
        
        const ariaLabel = taskElement.getAttribute('aria-label');
        const className = taskElement.className;
        const id = taskElement.id;
        
        log(`任务点状态检测:`);
        log(`  元素: ${taskElement.tagName}#${id}`);
        log(`  class: "${className}"`);
        log(`  aria-label: "${ariaLabel}"`);
        
        // 更精确的状态判断
        let result = false;
        if (ariaLabel) {
            if (ariaLabel.includes('已完成')) {
                result = true;
                log(`  → 状态: 已完成 (aria-label包含"已完成")`);
            } else if (ariaLabel.includes('未完成')) {
                result = false;
                log(`  → 状态: 未完成 (aria-label包含"未完成")`);
            } else {
                log(`  → 状态: 未知 (aria-label不包含"已完成"或"未完成")`);
            }
        } else {
            log(`  → 状态: 未知 (无aria-label属性)`);
        }
        
        // 检查class是否包含完成状态的标识
        if (className.includes('finish') || className.includes('complete')) {
            result = true;
            log(`  → 额外检查: class包含完成标识，状态设为已完成`);
        }
        
        return result;
    }
    
    // 安全点击元素
    function safeClick(element) {
        if (element && element.click) {
            element.click();
            log('已点击元素');
            return true;
        }
        return false;
    }
    
    // 主检测循环
    function mainCheck() {
        // 如果已经判断为最后一节，暂停检测并给出提示
        if (state.isLastSection) {
            log('检测到最后一节课程，自动暂停检测循环');
            log('如需继续检测，请刷新页面或点击控制面板的"开始"按钮');
            
            // 更新控制面板状态
            const statusElement = document.getElementById('status');
            const toggleBtn = document.getElementById('toggleBtn');
            if (statusElement) {
                statusElement.textContent = '已暂停(最后一节)';
            }
            if (toggleBtn) {
                toggleBtn.textContent = '开始';
            }
            
            // 清除定时器，停止循环
            if (window.autoStudyInterval) {
                clearInterval(window.autoStudyInterval);
                window.autoStudyInterval = null;
            }
            
            return; // 直接返回，不再执行后续检测
        }
        
        log('=== 开始新的检测循环 ===');
        
        const video = getVideoElement();
        const task = getTaskElement();
        const nextButton = getNextButton();
        
        log(`视频元素: ${video ? '存在' : '不存在'}`);
        log(`任务点元素: ${task ? '存在' : '不存在'}`);
        log(`下一节按钮: ${nextButton ? '存在' : '不存在'}`);
        
        // 处理视频卡住
        if (CONFIG.enableVideoStuckCheck && video) {
            log('开始检测视频是否卡住...');
            if (isVideoStuck(video)) {
                log('检测到视频卡住，尝试跳转');
                clickProgressEnd(video);
            } else {
                log('视频未检测到卡住');
            }
        } else {
            if (!CONFIG.enableVideoStuckCheck) {
                log('视频防卡住功能已禁用，跳过检测');
            } else {
                log('视频元素不存在，跳过卡住检测');
            }
        }
        
        // 检查任务点完成并点击下一节
        if (CONFIG.enableAutoNext) {
            log('开始检测任务点状态...');
            const taskCompleted = isTaskCompleted(task);
            log(`任务点检测结果: ${taskCompleted ? '已完成' : '未完成'}`);
            
            if (taskCompleted) {
                if (nextButton) {
                    // 找到下一节按钮，重置状态
                    state.consecutiveNoButtonCount = 0;
                    state.isLastSection = false;
                    
                    log('任务点已完成，准备点击下一节');
                    safeClick(nextButton);
                } else {
                    // 任务完成但没找到下一节按钮
                    state.consecutiveNoButtonCount++;
                    
                    if (state.consecutiveNoButtonCount >= CONFIG.maxConsecutiveNoButton) {
                        state.isLastSection = true;
                        log(`连续${CONFIG.maxConsecutiveNoButton}次未找到下一节按钮，判断为最后一节，停止查找`);
                    } else {
                        log(`任务点已完成，但未找到下一节按钮 (${state.consecutiveNoButtonCount}/${CONFIG.maxConsecutiveNoButton})`);
                    }
                }
            } else {
                // 任务未完成，重置状态
                state.consecutiveNoButtonCount = 0;
                state.isLastSection = false;
                log('任务点未完成，等待中...');
            }
        } else {
            log('自动下一行功能已禁用，跳过检测');
        }
        
        log('=== 检测循环结束 ===');
        
        // 显示iframe扫描统计
        const iframeStats = getIframeStats();
        if (iframeStats.total > 0) {
            log(`iframe扫描统计: 总共${iframeStats.total}个，可访问${iframeStats.accessible}个，跨域${iframeStats.crossOrigin}个`);
        }
        
        // 显示状态信息
        if (state.isLastSection) {
            log('当前状态：最后一节课程，已停止查找下一节按钮');
        } else if (state.consecutiveNoButtonCount > 0) {
            log(`当前状态：连续${state.consecutiveNoButtonCount}次未找到下一节按钮`);
        }
    }
    
    // 获取iframe统计信息
    function getIframeStats() {
        const stats = {
            total: 0,
            accessible: 0,
            crossOrigin: 0
        };
        
        const iframes = document.querySelectorAll('iframe');
        stats.total = iframes.length;
        
        for (let iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                    stats.accessible++;
                }
            } catch (e) {
                stats.crossOrigin++;
            }
        }
        
        return stats;
    }
    
    // 添加控制面板
    function addControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'auto-study-panel';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
            z-index: 9999;
            font-family: monospace;
        `;
        
        panel.innerHTML = `
            <div><strong>自动学习助手</strong></div>
            <div>状态: <span id="status">运行中</span></div>
            <div style="margin-top: 5px;">
                <input type="checkbox" id="videoStuckCheck" ${CONFIG.enableVideoStuckCheck ? 'checked' : ''}>
                <label for="videoStuckCheck">视频防卡住</label>
            </div>
            <div>
                <input type="checkbox" id="autoNextCheck" ${CONFIG.enableAutoNext ? 'checked' : ''}>
                <label for="autoNextCheck">自动下一行</label>
            </div>
            <button id="toggleBtn" style="margin-top: 5px; padding: 2px 8px;">暂停</button>
        `;
        
        document.body.appendChild(panel);
        
        // 控制按钮功能
        let isRunning = true;
        let intervalId = null;
        
        function updateStatus(running) {
            document.getElementById('status').textContent = running ? '运行中' : '已暂停';
            document.getElementById('toggleBtn').textContent = running ? '暂停' : '开始';
        }
        
        document.getElementById('toggleBtn').addEventListener('click', function() {
            isRunning = !isRunning;
            updateStatus(isRunning);
            
            if (isRunning) {
                // 重新开始时重置最后一节状态
                state.isLastSection = false;
                state.consecutiveNoButtonCount = 0;
                window.autoStudyInterval = setInterval(mainCheck, CONFIG.checkInterval);
                log('用户手动重新开始检测');
            } else {
                if (window.autoStudyInterval) {
                    clearInterval(window.autoStudyInterval);
                    window.autoStudyInterval = null;
                }
                log('用户手动暂停检测');
            }
        });
        
        // 视频防卡住功能开关
        document.getElementById('videoStuckCheck').addEventListener('change', function() {
            CONFIG.enableVideoStuckCheck = this.checked;
            log(`视频防卡住功能已${this.checked ? '启用' : '禁用'}`);
        });
        
        // 自动下一行功能开关
        document.getElementById('autoNextCheck').addEventListener('change', function() {
            CONFIG.enableAutoNext = this.checked;
            log(`自动下一行功能已${this.checked ? '启用' : '禁用'}`);
        });
        
        // 启动定时器
        window.autoStudyInterval = setInterval(mainCheck, CONFIG.checkInterval);
        updateStatus(true);
        
        log('自动学习助手已启动，检测间隔：' + CONFIG.checkInterval + 'ms');
        log('最后一节检测阈值：连续' + CONFIG.maxConsecutiveNoButton + '次未找到下一节按钮');
    }
    
    // 页面加载完成后初始化
    function init() {
        log('自动学习助手初始化');
        
        // 等待DOM加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addControlPanel);
        } else {
            addControlPanel();
        }
    }
    
    // 启动脚本
    init();
    
})();