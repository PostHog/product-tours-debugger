if (!window.__PH_TOUR_DEBUGGER_INJECTED__) {
  window.__PH_TOUR_DEBUGGER_INJECTED__ = true;

  function serialize(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return null;
    }
  }

  function getPostHog() {
    return window.posthog;
  }

  function respond(requestId, action, data, error) {
    window.postMessage({
      type: 'PH_DEBUG_TO_CONTENT',
      action,
      data: serialize(data),
      error: error || null,
      requestId
    }, '*');
  }

  function handleDetect(requestId) {
    const ph = getPostHog();
    if (!ph) {
      return respond(requestId, 'detect', { found: false, version: null, toursEnabled: false });
    }
    respond(requestId, 'detect', {
      found: true,
      version: ph.version || null,
      toursEnabled: !!(ph.productTours),
      pageUrl: window.location.href
    });
  }

  function handleGetTours(requestId) {
    const ph = getPostHog();
    if (!ph?.productTours?.getProductTours) {
      return respond(requestId, 'getTours', null, 'productTours.getProductTours not available');
    }
    try {
      ph.productTours.getProductTours((tours, context) => {
        respond(requestId, 'getTours', { tours: serialize(tours), context: serialize(context) });
      }, true);
    } catch (e) {
      respond(requestId, 'getTours', null, e.message);
    }
  }

  function handleGetActiveTours(requestId) {
    const ph = getPostHog();
    if (!ph?.productTours?.getActiveProductTours) {
      return respond(requestId, 'getActiveTours', null, 'productTours.getActiveProductTours not available');
    }
    try {
      ph.productTours.getActiveProductTours((tours) => {
        respond(requestId, 'getActiveTours', { tours: serialize(tours) });
      });
    } catch (e) {
      respond(requestId, 'getActiveTours', null, e.message);
    }
  }

  function handleGetFlags(requestId) {
    const ph = getPostHog();
    if (!ph?.featureFlags?.getFlagVariants) {
      return respond(requestId, 'getFlags', null, 'featureFlags.getFlagVariants not available');
    }
    try {
      const flags = ph.featureFlags.getFlagVariants();
      respond(requestId, 'getFlags', { flags: serialize(flags) });
    } catch (e) {
      respond(requestId, 'getFlags', null, e.message);
    }
  }

  function handleGetStorage(requestId) {
    const result = { shown: {}, completed: {}, dismissed: {}, activeTour: null };

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.startsWith('ph_product_tour_')) continue;

        const value = localStorage.getItem(key);
        if (key.includes('_shown')) {
          result.shown[key] = value;
        } else if (key.includes('_completed')) {
          result.completed[key] = value;
        } else if (key.includes('_dismissed')) {
          result.dismissed[key] = value;
        }
      }

      const active = sessionStorage.getItem('ph_active_product_tour');
      if (active) {
        try {
          result.activeTour = JSON.parse(active);
        } catch {
          result.activeTour = active;
        }
      }
    } catch (e) {
      return respond(requestId, 'getStorage', null, e.message);
    }

    respond(requestId, 'getStorage', result);
  }

  function handleShowTour(requestId, payload) {
    const ph = getPostHog();
    if (!ph?.productTours?.showProductTour) {
      return respond(requestId, 'showTour', null, 'productTours.showProductTour not available');
    }
    try {
      ph.productTours.showProductTour(payload.tourId);
      respond(requestId, 'showTour', { success: true });
    } catch (e) {
      respond(requestId, 'showTour', null, e.message);
    }
  }

  function handleDismissTour(requestId) {
    const ph = getPostHog();
    if (!ph?.productTours?.dismissProductTour) {
      return respond(requestId, 'dismissTour', null, 'productTours.dismissProductTour not available');
    }
    try {
      ph.productTours.dismissProductTour();
      respond(requestId, 'dismissTour', { success: true });
    } catch (e) {
      respond(requestId, 'dismissTour', null, e.message);
    }
  }

  function handleResetTour(requestId, payload) {
    const ph = getPostHog();
    if (!ph?.productTours?.resetTour) {
      return respond(requestId, 'resetTour', null, 'productTours.resetTour not available');
    }
    try {
      ph.productTours.resetTour(payload.tourId);
      respond(requestId, 'resetTour', { success: true });
    } catch (e) {
      respond(requestId, 'resetTour', null, e.message);
    }
  }

  function handleResetAllTours(requestId) {
    const ph = getPostHog();
    if (!ph?.productTours?.resetAllTours) {
      return respond(requestId, 'resetAllTours', null, 'productTours.resetAllTours not available');
    }
    try {
      ph.productTours.resetAllTours();
      respond(requestId, 'resetAllTours', { success: true });
    } catch (e) {
      respond(requestId, 'resetAllTours', null, e.message);
    }
  }

  function handleClearCache(requestId) {
    const ph = getPostHog();
    if (!ph?.productTours?.clearCache) {
      return respond(requestId, 'clearCache', null, 'productTours.clearCache not available');
    }
    try {
      ph.productTours.clearCache();
      respond(requestId, 'clearCache', { success: true });
    } catch (e) {
      respond(requestId, 'clearCache', null, e.message);
    }
  }

  function handleNextStep(requestId) {
    const ph = getPostHog();
    if (!ph?.productTours?.nextStep) {
      return respond(requestId, 'nextStep', null, 'productTours.nextStep not available');
    }
    try {
      ph.productTours.nextStep();
      respond(requestId, 'nextStep', { success: true });
    } catch (e) {
      respond(requestId, 'nextStep', null, e.message);
    }
  }

  function handlePreviousStep(requestId) {
    const ph = getPostHog();
    if (!ph?.productTours?.previousStep) {
      return respond(requestId, 'previousStep', null, 'productTours.previousStep not available');
    }
    try {
      ph.productTours.previousStep();
      respond(requestId, 'previousStep', { success: true });
    } catch (e) {
      respond(requestId, 'previousStep', null, e.message);
    }
  }

  function handleCheckSelector(requestId, payload) {
    try {
      const selector = payload.selector;
      const elements = document.querySelectorAll(selector);
      const count = elements.length;
      let visible = 0;
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
          visible++;
        }
      });
      respond(requestId, 'checkSelector', { found: count > 0, count, visible });
    } catch (e) {
      respond(requestId, 'checkSelector', null, e.message);
    }
  }

  const handlers = {
    detect: handleDetect,
    getTours: handleGetTours,
    getActiveTours: handleGetActiveTours,
    getFlags: handleGetFlags,
    getStorage: handleGetStorage,
    showTour: handleShowTour,
    dismissTour: handleDismissTour,
    resetTour: handleResetTour,
    resetAllTours: handleResetAllTours,
    clearCache: handleClearCache,
    nextStep: handleNextStep,
    previousStep: handlePreviousStep,
    checkSelector: handleCheckSelector
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'PH_DEBUG_TO_PAGE') return;

    const { action, payload, requestId } = event.data;
    const handler = handlers[action];
    if (handler) {
      handler(requestId, payload);
    } else {
      respond(requestId, action, null, `Unknown action: ${action}`);
    }
  });
}
