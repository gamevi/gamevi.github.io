/**
 * 🎯 نظام 1إدارة الإعلانات الذكي - النسخة المحسّنة والمُصلحة
 * ✅ إصلاح البانرات السوداء
 * ✅ إصلاح Popunder للعمل مرة واحدة فقط
 * ✅ إضافة جميع الإعلانات الجديدة
 * ✅ الحفاظ على نظام Anti-AdBlock
 * ✅ إضافة نظام تحجيم ذكي للإعلانات (Zero Clipping Solution)
 */

class AdsManager {
  constructor() {
    this.config = null;
    this.rotationTimers = {};
    this.sessionData = this.getSessionData();
    this.isAdBlockDetected = false;
    this.adElements = new Map();
    this.loadedScripts = new Set();
    this.popunderCount = 0;
    this.adScalingObservers = new Map();
    this.vignetteTimer = null; // ← أضف هذا السطر
  }

  // === نظام تحجيم الإعلانات الذكي ===
  scaleAdElement(adElement) {
    if (!adElement || !adElement.parentElement) return;
    
    const container = adElement.closest('[id^="ad-"]') || adElement.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const adWidth = adElement.offsetWidth || adElement.scrollWidth;
    
    if (adWidth > containerWidth && adWidth > 0) {
      const scale = containerWidth / adWidth;
      const scaleValue = Math.min(scale, 0.95);
      
      adElement.style.transform = `scale(${scaleValue})`;
      adElement.style.transformOrigin = 'top center';
      adElement.style.maxWidth = '100%';
      adElement.style.overflow = 'hidden';
      
      console.log(`📐 تحجيم الإعلان: ${adWidth}px -> ${containerWidth}px`);
    }
  }

  scaleAllAds() {
    document.querySelectorAll('.ad-banner iframe, .ad-banner ins, div[id^="banner-"], div[id^="sidebar-"]')
      .forEach(ad => this.scaleAdElement(ad));
  }

  startAdScalingSystem() {
    console.log('📏 بدء نظام تحجيم الإعلانات...');
    
    const observer = new MutationObserver(() => {
      setTimeout(() => this.scaleAllAds(), 100);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setInterval(() => this.scaleAllAds(), 2000);
    window.addEventListener('resize', () => this.scaleAllAds());
  }

  // === 1. تحميل الإعدادات ===
  async init() {
    try {
      this.filterUnityErrors();
      this.fixAdContainers();
      
      const response = await fetch('ads.json');
      if (!response.ok) throw new Error('Failed to load ads.json');
      
      this.config = await response.json();
      console.log('✅ تم تحميل إعدادات الإعلانات');
      
      // ✅ التحقق من تفعيل Anti-AdBlock
      const antiAdblockEnabled = this.config.antiAdblock?.enabled ?? true;
      
      if (antiAdblockEnabled) {
        console.log('🔍 Anti-AdBlock مُفعّل - بدء الفحص...');
        const adBlockDetected = await this.detectAdBlockEffectively();
        
        if (adBlockDetected) {
          console.log('🚫 AdBlock detected - Blocking page access');
          this.blockPageAccess();
          return;
        }
      } else {
        console.log('⚠️ Anti-AdBlock معطّل - تخطي الفحص');
      }
      
      // تحميل جميع الإعلانات
      await this.loadAllAds();
      console.log('🎯 تم تفعيل جميع الإعلانات بنجاح');
      this.startAdScalingSystem();
      
    } catch (error) {
      console.error('❌ خطأ في تحميل الإعلانات:', error);
      this.showFallbackAds();
    }
  }

  // === 2. كشف AdBlock بشكل فعال ===
  async detectAdBlockEffectively() {
    console.log('🔍 بدء كشف AdBlock...');
    
    const test1 = await this.testAdElement();
    console.log('📊 Test 1 - Element Test:', test1 ? 'BLOCKED' : 'PASSED');
    
    const test2 = await this.testAdScript();
    console.log('📊 Test 2 - Script Test:', test2 ? 'BLOCKED' : 'PASSED');
    
    const test3 = await this.testAdFetch();
    console.log('📊 Test 3 - Fetch Test:', test3 ? 'BLOCKED' : 'PASSED');
    
    const failures = [test1, test2, test3].filter(Boolean).length;
    const hasAdBlock = failures >= 2;
    
    console.log('📊 النتيجة النهائية:', hasAdBlock ? '🚫 ADBLOCK DETECTED' : '✅ NO ADBLOCK');
    this.isAdBlockDetected = hasAdBlock;
    
    return hasAdBlock;
  }

  // اختبار 1: إنشاء عنصر إعلان وتفحصه
  async testAdElement() {
    return new Promise(resolve => {
      const adElement = document.createElement('div');
      adElement.id = 'adblock-test-element-' + Date.now();
      
      const adClasses = [
        'ad', 'ads', 'advertisement', 'advert', 
        'ad-banner', 'ad-container', 'ad-wrapper',
        'pub', 'publicite', 'sponsor', 'sponsored'
      ];
      
      adClasses.forEach(className => {
        adElement.classList.add(className);
      });
      
      adElement.innerHTML = `
        <div style="width: 728px; height: 90px; background: #1a2a6c; color: white; 
                    display: flex; align-items: center; justify-content: center;">
          Advertisement
        </div>
      `;
      
      adElement.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 728px;
        height: 90px;
        z-index: -999999;
        visibility: hidden;
      `;
      
      document.body.appendChild(adElement);
      
      setTimeout(() => {
        const computedStyle = window.getComputedStyle(adElement);
        const isBlocked = 
          adElement.offsetHeight === 0 ||
          adElement.offsetWidth === 0 ||
          computedStyle.display === 'none' ||
          computedStyle.visibility === 'hidden' ||
          computedStyle.opacity === '0' ||
          adElement.style.display === 'none' ||
          !document.body.contains(adElement);
        
        if (adElement.parentNode) {
          adElement.parentNode.removeChild(adElement);
        }
        
        resolve(isBlocked);
      }, 500);
    });
  }

  // اختبار 2: محاولة تحميل سكريبت إعلان
  async testAdScript() {
    return new Promise(resolve => {
      const testScript = document.createElement('script');
      testScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
      testScript.id = 'adblock-test-script-' + Date.now();
      testScript.async = true;
      
      let scriptLoaded = false;
      let scriptBlocked = false;
      
      testScript.onload = () => {
        scriptLoaded = true;
        resolve(false);
      };
      
      testScript.onerror = () => {
        scriptBlocked = true;
        resolve(true);
      };
      
      document.head.appendChild(testScript);
      
      setTimeout(() => {
        if (!scriptLoaded && !scriptBlocked) {
          if (testScript.parentNode) {
            testScript.parentNode.removeChild(testScript);
          }
          resolve(true);
        }
      }, 2000);
    });
  }

  // اختبار 3: محاولة fetch لمسار إعلان
  async testAdFetch() {
    try {
      const response = await fetch('https://google-analytics.com/analytics.js', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      
      return false;
    } catch (error) {
      return true;
    }
  }

  // === 3. حجب الصفحة عند اكتشاف AdBlock ===
  blockPageAccess() {
    console.log('⛔ حجب الوصول إلى الصفحة...');
    
    const blockOverlay = document.createElement('div');
    blockOverlay.id = 'adblock-block-overlay';
    blockOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      padding: 20px;
      text-align: center;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      overflow: hidden;
    `;
    
    blockOverlay.addEventListener('contextmenu', e => e.preventDefault());
    blockOverlay.addEventListener('keydown', e => {
      if (e.key === 'F12' || e.key === 'F5' || 
          (e.ctrlKey && e.shiftKey && e.key === 'I') ||
          e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    
    blockOverlay.innerHTML = `
      <div style="
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(20px);
        border-radius: 20px;
        padding: 40px;
        max-width: 800px;
        width: 90%;
        border: 2px solid rgba(255, 68, 68, 0.5);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      ">
        <div style="font-size: 80px; color: #ff4444; margin-bottom: 20px;">
          🚫
        </div>
        
        <h1 style="font-size: 2.5rem; color: #ffd700; margin-bottom: 20px;">
          Ad Blocker Detected
        </h1>
        
        <div style="
          background: rgba(0, 0, 0, 0.4);
          border-radius: 15px;
          padding: 25px;
          margin-bottom: 25px;
          line-height: 1.7;
          text-align: left;
        ">
          <p style="font-size: 18px; margin-bottom: 15px;">
            <strong>We have detected that you are using an ad blocker.</strong>
          </p>
          
          <p style="margin-bottom: 15px; font-size: 16px;">
            Our website is <strong>100% free</strong> and relies exclusively on advertisements to operate. 
            By blocking ads, you are preventing us from providing free content.
          </p>
          
          <div style="
            background: rgba(255, 68, 68, 0.2);
            border-left: 4px solid #ff4444;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
          ">
            <p style="margin: 0; font-weight: bold; color: #ffd700;">
              ⚠️ <strong>Access Denied:</strong> You cannot access the game with ad blocker enabled.
            </p>
          </div>
          
          <h3 style="color: #3498db; margin: 20px 0 15px 0;">
            📋 To Continue:
          </h3>
          <ol style="margin-left: 20px; font-size: 16px;">
            <li style="margin-bottom: 8px;">Disable your ad blocker for this website</li>
            <li style="margin-bottom: 8px;">Refresh this page</li>
            <li style="margin-bottom: 8px;">Add our site to your whitelist</li>
          </ol>
        </div>
        
        <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-top: 30px;">
          <button onclick="window.location.reload()" style="
            background: linear-gradient(135deg, #2ecc71, #27ae60);
            color: white;
            border: none;
            padding: 16px 35px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
            transition: all 0.3s;
            min-width: 250px;
          ">
            🔄 I've Disabled Ad Blocker - Refresh
          </button>
          
          <button onclick="window.showAdBlockHelp()" style="
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            border: none;
            padding: 16px 35px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
            transition: all 0.3s;
            min-width: 250px;
          ">
            📖 How to Disable Ad Block
          </button>
        </div>
        
        <p style="margin-top: 25px; color: rgba(255, 255, 255, 0.7); font-size: 14px;">
          This message will appear until ad blocker is disabled.
        </p>
      </div>
    `;
    
    document.body.appendChild(blockOverlay);
    
    this.disableOriginalPage();
    
    window.showAdBlockHelp = () => this.showAdBlockHelp();
  }

  // === 4. تعطيل الصفحة الأصلية ===
  disableOriginalPage() {
    document.body.classList.add('adblock-blocked');
    
    const elements = document.querySelectorAll('a, button, input, select, textarea, iframe, [onclick]');
    elements.forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.3';
      el.style.filter = 'blur(2px)';
    });
    
    const gameIframe = document.getElementById('game-iframe');
    if (gameIframe) {
      gameIframe.style.pointerEvents = 'none';
      gameIframe.style.opacity = '0.2';
      gameIframe.style.filter = 'blur(5px) grayscale(1)';
    }
    
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  // === 5. عرض مساعدة AdBlock ===
  showAdBlockHelp() {
    const helpOverlay = document.createElement('div');
    helpOverlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a2a6c, #302b63);
      padding: 40px;
      border-radius: 20px;
      max-width: 900px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 2147483648;
      color: white;
      box-shadow: 0 30px 80px rgba(0,0,0,0.6);
      border: 2px solid #3498db;
    `;
    
    helpOverlay.innerHTML = `
      <div style="position: relative;">
        <button onclick="this.parentElement.parentElement.remove()" style="
          position: absolute;
          top: 15px;
          right: 15px;
          background: #ff4444;
          color: white;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 20px;
        ">✕</button>
        
        <h2 style="text-align: center; margin-bottom: 30px; color: #ffd700;">
          How to Disable Ad Blocker
        </h2>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
            <h3 style="color: #2ecc71;">AdBlock Plus</h3>
            <ol>
              <li>Click the AdBlock Plus icon</li>
              <li>Click "Don't run on pages on this domain"</li>
              <li>Refresh the page</li>
            </ol>
          </div>
          
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
            <h3 style="color: #3498db;">uBlock Origin</h3>
            <ol>
              <li>Click the uBlock Origin icon</li>
              <li>Click the big power button</li>
              <li>Refresh the page</li>
            </ol>
          </div>
          
          <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
            <h3 style="color: #9b59b6;">AdGuard</h3>
            <ol>
              <li>Click the AdGuard icon</li>
              <li>Disable protection for this site</li>
              <li>Refresh the page</li>
            </ol>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
          <button onclick="location.reload()" style="
            background: #2ecc71;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
          ">
            Refresh After Disabling
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(helpOverlay);
  }

  // === 6. تحميل جميع الإعلانات ===
  async loadAllAds() {
    console.log('📦 بدء تحميل جميع الإعلانات...');
    
    // 1. إعلانات سريعة (فورية)
    this.loadNativeBanner();
    
    // 2. إعلانات Sidebar
    setTimeout(() => {
      this.loadSidebarAds();
    }, 500);
    
    // 3. بانرات اللعبة
    await this.delay(1000);
    this.loadBanners();
    
    // 4. Social Bar
    await this.delay(1500);
    this.loadSocialBar();
    
    // 5. إعلان وسط الصفحة
    await this.delay(2000);
    this.loadMiddleAd();
    
    // 6. إعلان إضافي في Sidebar
    await this.delay(2500);
    this.loadExtraSidebarAd();
    
    // 7. إعلانات تفاعلية (Popunder & Smartlink)
    await this.delay(3000);
    this.loadPopunder();
    this.loadSmartlink();

    // 8. Vignette Banner
await this.delay(3500);
this.loadVignetteBanner(); 

    // 9. In-Page Push
await this.delay(4000);
this.loadInPagePush();
  
  }

  // === 7. تحميل البانرات ===
  async loadBanners() {
    console.log('🖼️ تحميل البانرات...');
    
    // فوق iframe
    if (this.config.banners?.aboveIframe?.enabled) {
      this.loadBannerAd('ad-above-iframe', this.config.banners.aboveIframe);
    }
    
    // تحت iframe
    if (this.config.banners?.belowIframe?.enabled) {
      setTimeout(() => {
        this.loadBannerAd('ad-below-iframe', this.config.banners.belowIframe);
      }, 1000);
    }
    
    // أسفل الصفحة
    if (this.config.banners?.pageBottom?.enabled) {
      setTimeout(() => {
        this.ensureContainerExists('ad-page-bottom');
        this.loadBannerAd('ad-page-bottom', this.config.banners.pageBottom);
      }, 1500);
    }
  }

  loadBannerAd(containerId, bannerConfig) {
    const container = this.ensureContainerExists(containerId);
    if (!container) {
      console.warn(`❌ Container ${containerId} not found`);
      return;
    }
    
    const ads = bannerConfig.ads;
    if (!ads || ads.length === 0) return;
    
    // تحميل أول إعلان
    this.loadSingleAd(container, ads[0], containerId);
    
    // التدوير
    if (bannerConfig.rotation && ads.length > 1) {
      let currentIndex = 0;
      const interval = bannerConfig.rotationInterval || 30000;
      
      // إيقاف المؤقت القديم إذا كان موجوداً
      if (this.rotationTimers[containerId]) {
        clearInterval(this.rotationTimers[containerId]);
      }
      
      this.rotationTimers[containerId] = setInterval(() => {
        currentIndex = (currentIndex + 1) % ads.length;
        this.loadSingleAd(container, ads[currentIndex], containerId);
        console.log(`🔄 تدوير إعلان في ${containerId}: ${ads[currentIndex].id}`);
      }, interval);
    }
  }

  // === دالة تحميل الإعلان ===
  loadSingleAd(container, ad, containerId) {
    if (!ad || !ad.script) return;
    
    console.log(`📢 تحميل إعلان: ${ad.id} في ${containerId}`);
    
    const uniqueId = `${ad.id}-${Date.now()}`;
    
    // استخدام atOptions ثابت
    window.atOptions = window.atOptions || {};
    Object.assign(window.atOptions, {
        ...ad.config,
        params: ad.config?.params || {}
    });
    
    // استخدام هيكل HTML محسن
    const adDiv = document.createElement('div');
    adDiv.className = 'ad-banner ad-modern-wrapper';
    adDiv.id = `ad-wrapper-${uniqueId}`;
    adDiv.setAttribute('data-ad-id', ad.id);
    adDiv.setAttribute('data-container', containerId);
    adDiv.innerHTML = `
      <div class="ad-label">Advertisement</div>
      <div class="ad-content-scaler" id="banner-${uniqueId}" style="text-align:center;min-height:${ad.config?.height || 90}px;background:transparent;"></div>
    `;
    
    container.innerHTML = '';
    container.appendChild(adDiv);
    
    setTimeout(() => {
        const script = document.createElement('script');
        script.src = ad.script;
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        script.id = `script-${uniqueId}`;
        
        script.onload = () => {
            console.log(`✅ تم تحميل إعلان: ${ad.id}`);
            setTimeout(() => {
              const adElement = document.getElementById(`banner-${uniqueId}`);
              if (adElement) this.scaleAdElement(adElement);
            }, 1000);
        };
        
        script.onerror = () => {
            console.warn(`⚠️ فشل تحميل إعلان: ${ad.id}`);
            this.showFallbackInContainer(container);
        };
        
        const targetElement = document.getElementById(`banner-${uniqueId}`);
        if (targetElement) {
            targetElement.appendChild(script);
        }
    }, 300);
  }

  // === 8. إضافة إعلان في وسط المحتوى ===
  loadMiddleAd() {
    if (!this.config.banners?.pageMiddle?.enabled) return;
    
    const container = this.ensureContainerExists('ad-page-middle');
    this.loadBannerAd('ad-page-middle', this.config.banners.pageMiddle);
  }

  // === 9. تحميل إعلان إضافي في الجانب ===
  loadExtraSidebarAd() {
    if (!this.config.sidebarAdExtra?.enabled) return;
    
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    
    // التحقق من عدم وجود الإعلان مسبقاً
    if (sidebar.querySelector('#ad-sidebar-extra')) return;
    
    const extraContainer = document.createElement('div');
    extraContainer.id = 'ad-sidebar-extra';
    extraContainer.style.cssText = `
      min-height: 300px;
      margin: 20px 0;
      background: rgba(0,0,0,0.7);
      border-radius: 8px;
      padding: 15px;
      position: relative;
      overflow: hidden;
    `;
    
    // إدراج الإعلان بعد الإعلان الحالي
    const existingAd = sidebar.querySelector('#ad-sidebar');
    if (existingAd && existingAd.nextSibling) {
      sidebar.insertBefore(extraContainer, existingAd.nextSibling);
    } else {
      sidebar.appendChild(extraContainer);
    }
    
    this.loadBannerAd('ad-sidebar-extra', this.config.sidebarAdExtra);
  }

  // === 10. تحميل Native Banner ===
  loadNativeBanner() {
    if (!this.config.nativeBanner?.enabled) return;
    
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    
    if (sidebar.querySelector('.native-ad-banner')) return;
    
    const container = document.createElement('div');
    container.className = 'ad-banner native-ad-banner ad-modern-wrapper';
    container.innerHTML = this.config.nativeBanner.html || '<div id="native-banner-container" class="ad-content-scaler"></div>';
    
    sidebar.insertBefore(container, sidebar.firstChild);
    
    if (this.config.nativeBanner.script) {
      setTimeout(() => {
        const script = document.createElement('script');
        script.src = this.config.nativeBanner.script;
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        container.appendChild(script);
        console.log('✅ Native Banner loaded');
      }, 1000);
    }
  }

  // === 11. تحميل إعلانات Sidebar ===
  loadSidebarAds() {
    if (!this.config.sidebarAd?.enabled) return;
    
    const container = document.getElementById('ad-sidebar');
    if (!container) {
      console.log('⚠️ حاوية Sidebar غير موجودة، إنشاء جديدة...');
      this.ensureContainerExists('ad-sidebar');
      return;
    }
    
    const ads = this.config.sidebarAd.ads;
    if (!ads || ads.length === 0) return;
    
    this.loadSidebarAd(container, ads[0]);
    
    // التدوير
    if (this.config.sidebarAd.rotation && ads.length > 1) {
      let currentIndex = 0;
      const interval = this.config.sidebarAd.rotationInterval || 45000;
      
      this.rotationTimers['sidebar'] = setInterval(() => {
        currentIndex = (currentIndex + 1) % ads.length;
        this.loadSidebarAd(container, ads[currentIndex]);
        console.log(`🔄 تدوير إعلان Sidebar: ${ads[currentIndex].id}`);
      }, interval);
    }
  }

  // === دالة تحميل إعلان Sidebar ===
  loadSidebarAd(container, ad) {
    const uniqueId = `${ad.id}-${Date.now()}`;
    
    // استخدام atOptions ثابت
    window.atOptions = window.atOptions || {};
    Object.assign(window.atOptions, {
        ...ad.config,
        params: ad.config?.params || {}
    });
    
    const adDiv = document.createElement('div');
    adDiv.className = 'ad-banner ad-sidebar ad-modern-wrapper';
    adDiv.setAttribute('data-ad-id', ad.id);
    adDiv.setAttribute('data-container', 'sidebar');
    adDiv.innerHTML = `
      <div class="ad-label">Advertisement</div>
      <div class="ad-content-scaler" id="sidebar-${uniqueId}" style="text-align:center;min-height:${ad.config?.height || 300}px;background:transparent;"></div>
    `;
    
    container.innerHTML = '';
    container.appendChild(adDiv);
    
    setTimeout(() => {
        const script = document.createElement('script');
        script.src = ad.script;
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        script.id = `sidebar-script-${uniqueId}`;
        
        script.onload = () => {
            console.log(`✅ Sidebar Ad loaded: ${ad.id}`);
            setTimeout(() => {
              const adElement = document.getElementById(`sidebar-${uniqueId}`);
              if (adElement) this.scaleAdElement(adElement);
            }, 1000);
        };
        
        script.onerror = () => {
            console.warn(`⚠️ فشل تحميل Sidebar Ad: ${ad.id}`);
            this.showFallbackInContainer(container);
        };
        
        const targetElement = document.getElementById(`sidebar-${uniqueId}`);
        if (targetElement) {
            targetElement.appendChild(script);
        }
    }, 300);
  }

  // === 12. تحميل Social Bar ===
  loadSocialBar() {
    if (!this.config.socialBar?.enabled) return;
    
    const socialBarScript = this.config.socialBar.script;
    if (!socialBarScript) return;
    
    // التحقق من عدم تحميل السكريبت مسبقاً
    if (this.loadedScripts.has(socialBarScript)) {
      console.log('⚠️ Social Bar already loaded');
      return;
    }
    
    setTimeout(() => {
      const script = document.createElement('script');
      script.src = socialBarScript;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      script.id = 'social-bar-script';
      
      document.body.appendChild(script);
      this.loadedScripts.add(socialBarScript);
      
      console.log('✅ Social Bar loaded');
    }, this.config.socialBar.delay || 5000);
  }

  // === 13. تحميل Popunder ===
  loadPopunder() {
    if (!this.config.popunder?.enabled) return;
    
    const frequency = this.config.popunder.frequency;
    const maxPerSession = this.config.popunder.maxPerSession || 1;
    
    // التحقق من عدد المرات المسموح بها
    if (frequency === 'once_per_session') {
      const currentCount = this.sessionData.popunderCount || 0;
      
      if (currentCount >= maxPerSession) {
        console.log(`⚠️ Popunder limit reached: ${currentCount}/${maxPerSession}`);
        return;
      }
    }
    
    setTimeout(() => {
      this.config.popunder.scripts.forEach((scriptUrl, index) => {
        // التحقق من عدم تحميل السكريبت مسبقاً
        if (this.loadedScripts.has(scriptUrl)) {
          console.log(`⚠️ Popunder script already loaded: ${scriptUrl}`);
          return;
        }
        
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        script.id = `popunder-script-${index}`;
        
        document.body.appendChild(script);
        this.loadedScripts.add(scriptUrl);
        
        console.log(`✅ Popunder script loaded: ${scriptUrl}`);
      });
      
      // تحديث العداد
      this.sessionData.popunderCount = (this.sessionData.popunderCount || 0) + 1;
      this.sessionData.popunderShown = true;
      this.saveSessionData();
      
      console.log(`📊 Popunder count: ${this.sessionData.popunderCount}/${maxPerSession}`);
    }, this.config.popunder.delay || 8000);
  }

  // === 14. تحميل Smartlink Popunder ===
  loadSmartlink() {
    if (!this.config.smartlink?.enabled) return;
    
    const mode = this.config.smartlink.mode || 'direct';
    
    if (mode === 'popunder' && this.config.smartlink.triggerOnClick) {
      console.log('🎯 تفعيل Smartlink Popunder بالنقر...');
      this.setupSmartlinkPopunder();
    } else {
      // الطريقة القديمة (فتح مباشر)
      this.openSmartlinkDirect();
    }
  }

  // دالة جديدة: إعداد Popunder بالنقر
  setupSmartlinkPopunder() {
    const minInterval = this.config.smartlink.minIntervalBetweenShows || 300000; // 5 دقائق
    const maxShows = this.config.smartlink.maxShowsPerSession || 3;
    
    // التحقق من عدد المرات المسموح بها
    if (this.sessionData.smartlinkCount >= maxShows) {
      console.log(`⚠️ تم الوصول للحد الأقصى: ${this.sessionData.smartlinkCount}/${maxShows}`);
      return;
    }
    
    // التحقق من آخر مرة ظهر فيها
    const lastShown = this.sessionData.lastSmartlinkShown;
    if (lastShown) {
      const timePassed = Date.now() - lastShown;
      if (timePassed < minInterval) {
        const timeLeft = minInterval - timePassed;
        console.log(`⏰ يجب الانتظار ${Math.ceil(timeLeft / 1000)} ثانية قبل الظهور مرة أخرى`);
        
        // جدولة الظهور التالي
        setTimeout(() => {
          this.setupSmartlinkPopunder();
        }, timeLeft);
        return;
      }
    }
    
    // إضافة مستمع النقر على الصفحة بأكملها
    const clickHandler = (e) => {
      // تجاهل النقرات على الروابط الخارجية
      if (e.target.tagName === 'A' && e.target.href && e.target.href.startsWith('http')) {
        return;
      }
      
      console.log('🖱️ تم اكتشاف نقرة - فتح Smartlink Popunder...');
      
      // فتح Popunder
      this.openSmartlinkPopunder();
      
      // إزالة المستمع بعد التنفيذ
      document.removeEventListener('click', clickHandler);
      
      // تحديث بيانات الجلسة
      this.sessionData.smartlinkCount = (this.sessionData.smartlinkCount || 0) + 1;
      this.sessionData.lastSmartlinkShown = Date.now();
      this.saveSessionData();
      
      console.log(`📊 عدد مرات الظهور: ${this.sessionData.smartlinkCount}/${maxShows}`);
      
      // إعادة تفعيل المستمع بعد الفترة المحددة
      setTimeout(() => {
        if (this.sessionData.smartlinkCount < maxShows) {
          console.log('🔄 إعادة تفعيل Smartlink Popunder...');
          this.setupSmartlinkPopunder();
        }
      }, minInterval);
    };
    
    // إضافة المستمع
    document.addEventListener('click', clickHandler, { once: false });
    console.log('✅ Smartlink Popunder جاهز - في انتظار نقرة المستخدم...');
  }

  // دالة جديدة: فتح Popunder في تاب جديد
  openSmartlinkPopunder() {
    const url = this.config.smartlink.url;
    
    try {
      // فتح في تاب جديد كامل
      const newTab = window.open(url, '_blank', 'noopener,noreferrer');
      
      if (newTab) {
        console.log('✅ تم فتح Smartlink في تاب جديد');
        return true;
      } else {
        console.warn('⚠️ فشل فتح التاب - ربما يوجد حاجب نوافذ منبثقة');
        // محاولة بديلة
        window.open(url, '_blank');
        return false;
      }
    } catch (error) {
      console.error('❌ خطأ في فتح Smartlink:', error);
      return false;
    }
  }

  // دالة الطريقة القديمة (احتياطي)
  openSmartlinkDirect() {
    const frequency = this.config.smartlink.frequency;
    if (frequency === 'once_per_session' && this.sessionData.smartlinkOpened) {
      console.log('⚠️ Smartlink already opened in this session');
      return;
    }
    
    const openSmartlink = () => {
      setTimeout(() => {
        if (this.config.smartlink.openInNewTab) {
          const newTab = window.open(this.config.smartlink.url, '_blank', 'noopener,noreferrer');
          if (newTab) {
            this.sessionData.smartlinkOpened = true;
            this.saveSessionData();
            console.log('✅ Smartlink opened in new tab');
          }
        } else {
          window.location.href = this.config.smartlink.url;
        }
      }, this.config.smartlink.delay || 3000);
    };
    
    const checkGameLoaded = (attempt = 1) => {
      const iframe = document.getElementById('game-iframe');
      
      if (iframe && iframe.contentWindow) {
        openSmartlink();
      } else if (attempt < 10) {
        setTimeout(() => checkGameLoaded(attempt + 1), 1000);
      } else {
        openSmartlink();
      }
    };
    
    setTimeout(() => checkGameLoaded(), 2000);
  }

// === تحميل In-Page Push (Monetag) ===
loadInPagePush() {
  if (!this.config.inPagePush?.enabled) return;

  const zone = this.config.inPagePush.zone;
  const scriptUrl = this.config.inPagePush.script;
  const delay = this.config.inPagePush.delay || 2000;

  if (!scriptUrl || !zone) {
    console.warn('⚠️ In-Page Push: بيانات ناقصة');
    return;
  }

  const scriptKey = `inpagepush-${zone}`;
  if (this.loadedScripts.has(scriptKey)) {
    console.log('⚠️ In-Page Push already loaded');
    return;
  }

  setTimeout(() => {
    const script = document.createElement('script');
    script.dataset.zone = zone;
    script.src = scriptUrl;
    script.async = true;
    script.setAttribute('data-cfasync', 'false');

    document.body.appendChild(script);
    this.loadedScripts.add(scriptKey);

    script.onload = () => console.log('✅ In-Page Push loaded');
    script.onerror = () => console.warn('⚠️ فشل تحميل In-Page Push');
  }, delay);
}
// === تحميل Vignette Banner مع التحكم في التكرار ===
loadVignetteBanner() {
  if (!this.config.vignetteBanner?.enabled) return;
  
  const delay = this.config.vignetteBanner.delay || 1000;
  const zone = this.config.vignetteBanner.zone || "10480837";
  const scriptUrl = this.config.vignetteBanner.script;
  const repeatInterval = this.config.vignetteBanner.repeatInterval || 300000;
  const maxShows = this.config.vignetteBanner.maxShowsPerSession || 999;
  
  if (!scriptUrl) {
    console.warn('⚠️ Vignette Banner script URL missing');
    return;
  }
  
  // ✅ التحقق من أن السكريبت لم يتم تحميله مسبقاً في هذه الدورة
  const scriptKey = `vignette-${scriptUrl}`;
  if (this.loadedScripts.has(scriptKey)) {
    console.log('⚠️ Vignette script already loaded in this cycle');
    return;
  }
  
  // التحقق من الحد الأقصى
  if (this.sessionData.vignetteCount >= maxShows) {
    console.log(`⚠️ تم الوصول للحد الأقصى: ${this.sessionData.vignetteCount}/${maxShows}`);
    return;
  }
  
  // التحقق من آخر مرة ظهر فيها
  const lastShown = this.sessionData.lastVignetteShown;
  if (lastShown) {
    const timePassed = Date.now() - lastShown;
    if (timePassed < repeatInterval) {
      const timeLeft = repeatInterval - timePassed;
      console.log(`⏰ Vignette: يجب الانتظار ${Math.ceil(timeLeft / 1000)} ثانية قبل الظهور مرة أخرى`);
      
      // جدولة الظهور التالي
      if (this.vignetteTimer) {
        clearTimeout(this.vignetteTimer);
      }
      
      this.vignetteTimer = setTimeout(() => {
        this.loadedScripts.delete(scriptKey); // ✅ السماح بالتحميل في الدورة التالية
        this.loadVignetteBanner();
      }, timeLeft);
      return;
    }
  }
  
  // تحميل الإعلان
  setTimeout(() => {
    console.log(`🎭 تحميل Vignette Banner - المرة رقم: ${(this.sessionData.vignetteCount || 0) + 1}`);
    
    // ✅ تحديث البيانات قبل التحميل لمنع التكرار
    this.sessionData.vignetteCount = (this.sessionData.vignetteCount || 0) + 1;
    this.sessionData.lastVignetteShown = Date.now();
    this.saveSessionData();
    
    // ✅ تسجيل السكريبت كمحمّل
    this.loadedScripts.add(scriptKey);
    
    const script = document.createElement('script');
    script.id = `vignette-script-${Date.now()}`;
    script.textContent = `
      (function(s) {
        s.dataset.zone = '${zone}';
        s.src = '${scriptUrl}';
      })([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));
    `;
    
    document.head.appendChild(script);
    
    console.log(`✅ تم تحميل Vignette Banner - العدد: ${this.sessionData.vignetteCount}/${maxShows}`);
    console.log(`⏰ الظهور التالي بعد: ${repeatInterval / 1000} ثانية (${repeatInterval / 60000} دقيقة)`);
    
    // جدولة الظهور التالي
    if (this.sessionData.vignetteCount < maxShows) {
      if (this.vignetteTimer) {
        clearTimeout(this.vignetteTimer);
      }
      
      this.vignetteTimer = setTimeout(() => {
        this.loadedScripts.delete(scriptKey); // ✅ السماح بالتحميل في الدورة التالية
        this.loadVignetteBanner();
      }, repeatInterval);
    }
  }, delay);
}
  
  // === 15. فحص وإصلاح الحاويات ===
  fixAdContainers() {
    console.log('🔧 فحص وإصلاح حاويات الإعلانات...');
    
    const containers = [
      'ad-above-iframe',
      'ad-below-iframe', 
      'ad-page-bottom',
      'ad-sidebar',
      'ad-page-middle'
    ];
    
    containers.forEach(containerId => {
      let container = document.getElementById(containerId);
      
      if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'ad-container-responsive';
        container.style.cssText = `
          min-height: 50px;
          margin: 20px 0;
          position: relative;
          background: transparent;
          overflow: hidden;
          max-width: 100%;
        `;
        
        // تحديد مكان الإدراج
        switch(containerId) {
          case 'ad-above-iframe':
          case 'ad-below-iframe':
            const gameContainer = document.querySelector('.game-container');
            if (gameContainer) {
              if (containerId === 'ad-above-iframe') {
                const iframe = gameContainer.querySelector('.game-frame');
                if (iframe) {
                  gameContainer.insertBefore(container, iframe);
                } else {
                  gameContainer.prepend(container);
                }
              } else {
                gameContainer.appendChild(container);
              }
            }
            break;
            
          case 'ad-page-bottom':
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
              const seoContent = mainContent.querySelector('.seo-content');
              if (seoContent) {
                seoContent.parentNode.insertBefore(container, seoContent.nextSibling);
              } else {
                mainContent.appendChild(container);
              }
            }
            break;
            
          case 'ad-sidebar':
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
              sidebar.appendChild(container);
            }
            break;
            
          case 'ad-page-middle':
            const gameFrame3 = document.querySelector('.game-frame, #game-iframe');
            const aboveBanner3 = document.getElementById('ad-above-iframe');
            const belowBanner3 = document.getElementById('ad-below-iframe');
            const gameContainer3 = document.querySelector('.game-container');

            if (gameFrame3 && gameFrame3.parentNode) {
              gameFrame3.parentNode.insertBefore(container, gameFrame3.nextSibling);
            } else if (aboveBanner3 && aboveBanner3.parentNode) {
              aboveBanner3.parentNode.insertBefore(container, aboveBanner3.nextSibling);
            } else if (belowBanner3 && belowBanner3.parentNode) {
              belowBanner3.parentNode.insertBefore(container, belowBanner3);
            } else if (gameContainer3) {
              const children3 = Array.from(gameContainer3.children);
              const mid3 = Math.floor(children3.length / 2);
              gameContainer3.insertBefore(container, children3[mid3] || null);
            }
            break;
        }
        
        console.log(`✅ تم إنشاء حاوية: ${containerId}`);
      }
    });
  }

  // === 16. دالة مساعدة للتأكد من وجود الحاوية ===
  ensureContainerExists(containerId) {
    let container = document.getElementById(containerId);
    
    if (!container) {
      console.log(`⚠️ حاوية ${containerId} غير موجودة، إنشاء جديدة...`);
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'ad-container-responsive';
      container.style.cssText = `
        min-height: 50px;
        margin: 20px 0;
        position: relative;
        background: transparent;
        overflow: hidden;
        max-width: 100%;
      `;
      
      // محاولة إيجاد مكان مناسب
      if (containerId.includes('above')) {
        const gameFrame = document.querySelector('.game-frame');
        if (gameFrame && gameFrame.parentNode) {
          gameFrame.parentNode.insertBefore(container, gameFrame);
        }
      } else if (containerId.includes('below')) {
        const gameFrame = document.querySelector('.game-frame');
        if (gameFrame && gameFrame.parentNode) {
          gameFrame.parentNode.insertBefore(container, gameFrame.nextSibling);
        }
      } else if (containerId.includes('sidebar')) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
          sidebar.appendChild(container);
        }
      } else {
        document.body.appendChild(container);
      }
    }
    
    return container;
  }

  // === 17. عرض إعلانات فولباك ===
  showFallbackAds() {
    console.log('🔄 عرض إعلانات احتياطية...');
    
    const fallbackAds = [
      {
        id: 'fallback-1',
        html: `
          <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:20px;">
            <div class="ad-label">Advertisement</div>
            <p style="color:#fff;margin:10px 0;">Support our site by disabling ad blocker</p>
            <a href="#" onclick="window.location.reload()" style="color:#3498db;text-decoration:none;">Refresh after disabling</a>
          </div>
        `
      }
    ];
    
    ['ad-above-iframe', 'ad-below-iframe', 'ad-sidebar'].forEach(containerId => {
      const container = document.getElementById(containerId);
      if (container && fallbackAds[0]) {
        container.innerHTML = fallbackAds[0].html;
      }
    });
  }

  // === 18. دالة عرض بديل عند فشل الإعلان ===
  showFallbackInContainer(container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:20px;">
            <div class="ad-label">Advertisement</div>
            <p style="color:#fff;margin:10px 0;">Support our site by allowing ads</p>
            <p style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:10px;">
                Ad failed to load. Please check your ad blocker settings.
            </p>
        </div>
    `;
    
    setTimeout(() => {
        if (container.innerHTML.includes('Ad failed to load')) {
            container.innerHTML = `
                <div class="ad-banner ad-modern-wrapper" style="text-align:center;padding:15px;">
                    <div class="ad-label">Sponsored</div>
                    <div style="color:#fff;padding:10px;">
                        <p style="margin:5px 0;">Play more games at FreePlayHub</p>
                        <a href="https://rowhub.github.io" style="color:#3498db;text-decoration:none;">Browse All Games</a>
                    </div>
                </div>
            `;
        }
    }, 15000);
  }

  // === 19. إدارة الجلسة ===
  getSessionData() {
    try {
      const data = sessionStorage.getItem('adsSessionData');
      return data ? JSON.parse(data) : {
        popunderShown: false,
        popunderCount: 0,
        smartlinkOpened: false,
        smartlinkCount: 0,
        lastSmartlinkShown: null,
        vignetteCount: 0,              // ← أضف هذا
        lastVignetteShown: null,       // ← أضف هذا
        adsLoaded: 0,
        sessionId: Date.now()
      };
    } catch (error) {
      console.error('خطأ في قراءة بيانات الجلسة:', error);
      return {
        popunderShown: false,
        popunderCount: 0,
        smartlinkOpened: false,
        adsLoaded: 0,
        sessionId: Date.now()
      };
    }
  }

  saveSessionData() {
    try {
      sessionStorage.setItem('adsSessionData', JSON.stringify(this.sessionData));
      console.log('💾 تم حفظ بيانات الجلسة:', this.sessionData);
    } catch (error) {
      console.error('خطأ في حفظ بيانات الجلسة:', error);
    }
  }

  // === 20. تصفية أخطاء Unity ===
  filterUnityErrors() {
    const originalError = console.error;
    console.error = function(...args) {
      if (args[0] && typeof args[0] === 'string') {
        const errorMsg = args[0];
        if (errorMsg.includes('The referenced script') || errorMsg.includes('is missing!')) {
          return;
        }
      }
      originalError.apply(console, args);
    };
  }

  // === 21. دالة مساعدة للتأخير ===
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // === 22. تنظيف الموارد ===
  destroy() {
    Object.values(this.rotationTimers).forEach(timer => clearInterval(timer));
    this.rotationTimers = {};
    if (this.vignetteTimer) {           // ← أضف هذه الأسطر
    clearTimeout(this.vignetteTimer);  // ← 
    this.vignetteTimer = null;         // ←
  }            
    this.loadedScripts.clear();
    console.log('🧹 تم تنظيف موارد الإعلانات');
  }
}

// === تشغيل تلقائي ===
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 بدء تشغيل نظام الإعلانات...');
  
  const adsManager = new AdsManager();
  adsManager.init();
  window.adsManager = adsManager;
  
  // إضافة أنماط CSS محسنة
  const style = document.createElement('style');
  style.textContent = `
    .ad-banner {
      background: rgba(0,0,0,0.7);
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      position: relative;
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255,255,255,0.1);
      transition: all 0.3s ease;
      min-height: 50px;
      overflow: hidden !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      text-align: center !important;
    }
    
    .ad-modern-wrapper {
      width: 100% !important;
      height: auto !important;
    }
    
    .ad-content-scaler {
      display: inline-block !important;
      transition: all 0.3s ease !important;
      max-width: 100% !important;
      transform-origin: top center !important;
      overflow: hidden !important;
      position: relative !important;
    }
    
    .ad-banner:hover {
      border-color: rgba(255,255,255,0.3);
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    }
    
    .ad-label {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.6);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      z-index: 10;
    }
    
    .ad-sidebar {
      position: sticky;
      top: 100px;
      margin-bottom: 20px;
    }
    
    .native-ad-banner {
      background: linear-gradient(135deg, rgba(26,42,108,0.8), rgba(178,31,31,0.8));
    }
    
    #ad-above-iframe {
      margin-bottom: 15px;
    }
    
    #ad-below-iframe {
      margin-top: 15px;
      margin-bottom: 25px;
    }
    
    #ad-page-bottom {
      margin-top: 30px;
      margin-bottom: 20px;
      text-align: center;
    }
    
    #ad-page-middle {
      margin: 25px 0;
      text-align: center;
    }
    
    #ad-sidebar-extra {
      margin-top: 20px;
    }
    
    body.adblock-blocked > *:not(#adblock-block-overlay) {
      pointer-events: none !important;
      opacity: 0.3;
      filter: blur(2px);
    }
    
    #adblock-block-overlay,
    #adblock-block-overlay * {
      filter: none !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    
    /* إصلاحات Zero Clipping */
    .ad-container-responsive {
      max-width: 100vw !important;
      overflow-x: hidden !important;
    }

    /* === حل نهائي للإعلانات الكبيرة على الموبايل === */
    .ad-banner iframe,
    .ad-banner ins,
    .ad-modern-wrapper iframe,
    .ad-modern-wrapper ins,
    div[id^="banner-"] iframe,
    div[id^="sidebar-"] iframe {
      max-width: 100% !important;
      max-height: 100% !important;
      transform-origin: top center !important;
      display: block !important;
      margin: 0 auto !important;
      transform: scale(0.95) !important;
    }

    @media (max-width: 768px) {
      .ad-banner iframe,
      .ad-banner ins {
        transform: scale(0.9) !important;
        transform-origin: center center !important;
      }
      
      html, body {
        overflow-x: hidden !important;
        position: relative;
        width: 100%;
      }
    }

    ins.adsbygoogle[data-ad-status="unfilled"],
    ins.adsbygoogle iframe {
      max-width: 100% !important;
      width: 100% !important;
    }
    
    /* منع التمرير الأفقي على جميع الأجهزة */
    html, body {
      overflow-x: hidden !important;
      max-width: 100% !important;
    }
    
    /* تحسين العرض على الأجهزة المحمولة */
    @media (max-width: 768px) {
      .ad-banner {
        padding: 10px !important;
        margin: 10px 0 !important;
        border-radius: 6px !important;
      }
      
      .ad-sidebar {
        position: static !important;
      }
      
      .ad-content-scaler {
        transform-origin: center center !important;
      }
      
      /* تحجيم تلقائي للبانرات العريضة على الموبايل */
      #ad-above-iframe,
      #ad-below-iframe,
      #ad-page-bottom {
        padding: 8px !important;
        margin: 8px 0 !important;
      }
      
      /* ضبط أقصى عرض للإعلانات على الموبايل */
      .ad-banner > *,
      .ad-modern-wrapper > * {
        max-width: calc(100vw - 20px) !important;
      }
    }
    
    @media (max-width: 480px) {
      .ad-banner {
        padding: 6px !important;
        margin: 6px 0 !important;
        border-radius: 4px !important;
      }
      
      .ad-label {
        font-size: 8px;
        padding: 1px 4px;
      }
      
      /* ضبط أقصر لأحجام الإعلانات على الشاشات الصغيرة */
      #ad-sidebar,
      #ad-sidebar-extra {
        min-height: 250px !important;
      }
    }
    
    /* أنماط التحجيم الذكي */
    .ad-scaled {
      transition: transform 0.3s ease !important;
    }
    
    /* منع التمرير الأفقي داخل الإعلانات */
    .ad-banner * {
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    
    /* إصلاح خاص لشركات الإعلانات الشائعة */
    ins.adsbygoogle,
    iframe[src*="ads"],
    div[id*="ad"],
    div[class*="ad"] {
      max-width: 100% !important;
      overflow: hidden !important;
    }
  `;
  document.head.appendChild(style);
  
  console.log('🎨 تم تحميل أنماط الإعلانات');

});
