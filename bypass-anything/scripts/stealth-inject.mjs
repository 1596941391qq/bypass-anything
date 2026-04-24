/**
 * 11 模块反检测注入脚本
 *
 * 基于 puppeteer-extra-plugin-stealth 的 11 个 evasion 模块，
 * 适配 CDP WebSocket Runtime.evaluate 注入。
 *
 * 每个模块是一个 JS 字符串，通过 CDP Runtime.evaluate 在页面加载前执行。
 * 用法:
 *   import { STEALTH_SCRIPTS, injectStealth } from './stealth-inject.mjs';
 *   await injectStealth(send);  // send = CDP send function
 */

export const STEALTH_SCRIPTS = [
  // 1. navigator.webdriver
  `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`,

  // 2. Chrome runtime API
  `if (!window.chrome) {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
      OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
      PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
      RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
      connect: function() { return { onDisconnect: { addListener: function(){} }, onMessage: { addListener: function(){} }, postMessage: function(){}, sendMessage: function(){} }; },
      sendMessage: function() {}
    };
  }
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = function() { return { commitLoadTime: Date.now()/1000, connectionInfo: 'h2', finishDocumentLoadTime: 0, finishLoadTime: 0, firstPaintAfterLoadTime: 0, firstPaintTime: 0, navigationType: 'Other', npnNegotiatedProtocol: 'h2', requestTime: Date.now()/1000, startLoadTime: Date.now()/1000, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true }; };
  }
  if (!window.chrome.csi) {
    window.chrome.csi = function() { return { onloadT: Date.now(), startE: Date.now(), pageT: Math.random()*1000+500, tran: 15 }; };
  }`,

  // 3. Permissions API
  `if (navigator.permissions) {
    var origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(parameters) {
      return parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission || 'default' })
        : origQuery(parameters);
    };
  }`,

  // 4. iframe contentWindow fix
  `try {
    var desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (desc && desc.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: function() {
          var win = desc.get.call(this);
          return win || window;
        },
        configurable: true
      });
    }
  } catch(e) {}`,

  // 5. WebGL vendor/renderer
  `try {
    var getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, param);
    };
    if (typeof WebGL2RenderingContext !== 'undefined') {
      var getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter2.call(this, param);
      };
    }
  } catch(e) {}`,

  // 6. navigator.plugins (fake common plugins)
  `try {
    Object.defineProperty(navigator, 'plugins', {
      get: function() {
        var plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        plugins.length = plugins.length;
        return plugins;
      }
    });
  } catch(e) {}`,

  // 7. navigator.languages
  `try {
    Object.defineProperty(navigator, 'languages', {
      get: function() { return ['en-US', 'en', 'zh-CN']; }
    });
  } catch(e) {}`,

  // 8. media codecs (canPlayType)
  `try {
    var origCanPlay = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type) {
      if (!type) return '';
      if (type.indexOf('video/mp4') === 0) return 'maybe';
      if (type.indexOf('video/webm') === 0) return 'maybe';
      if (type.indexOf('audio/mpeg') === 0) return 'probably';
      if (type.indexOf('audio/ogg') === 0) return 'probably';
      if (type.indexOf('audio/wav') === 0) return 'probably';
      return origCanPlay.call(this, type);
    };
  } catch(e) {}`,

  // 9. sourceURL leak fix
  `try {
    var origToString = Function.prototype.toString;
    Function.prototype.toString = function() {
      var str = origToString.call(this);
      if (str.indexOf('//@ sourceURL=') !== -1) {
        str = str.replace(/\/\/@ sourceURL=[^\\s]*/g, '');
      }
      return str;
    };
  } catch(e) {}`,

  // 10. navigator.hardwareConcurrency
  `try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: function() { return 8; }
    });
  } catch(e) {}`,

  // 11. navigator.deviceMemory
  `try {
    Object.defineProperty(navigator, 'deviceMemory', {
      get: function() { return 8; }
    });
  } catch(e) {}`,
];

/**
 * 注入所有 stealth 脚本到 CDP 连接
 */
export async function injectStealth(send) {
  for (let i = 0; i < STEALTH_SCRIPTS.length; i++) {
    try {
      await send('Runtime.evaluate', {
        expression: `(function(){ ${STEALTH_SCRIPTS[i]} })()`,
        returnByValue: true,
      });
    } catch (e) {
      console.warn(`  [Stealth] Module ${i + 1} failed: ${e.message}`);
    }
  }
  console.log(`  [Stealth] ${STEALTH_SCRIPTS.length} modules injected`);
}
