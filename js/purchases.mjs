export const FULL_PRODUCT_ID = "com.local.familydraw.fullversion";
// Entitlements never enter profiles, backups, localStorage or URL parameters.
export function createPurchases({ bridge, onChange = () => {} } = {}) {
  let state = {
    ready: !bridge,
    unlocked: false,
    price: "",
    available: false,
    busy: false,
    result: bridge ? "checking" : "unavailable",
  };
  let sequence = 0;
  let pending = null;
  let pendingAction = "";
  let queuedRefresh = null;
  const publish = (patch) => {
    const previous = state;
    const next = { ...state, ...patch };
    if (Object.keys(next).every((key) => next[key] === state[key])) return state;
    state = next;
    onChange(state, previous);
    return state;
  };
  function request(action, changed = false) {
    // Startup and native-active can arrive together. Share the same status
    // request rather than accepting an early native busy snapshot as final.
    if (pending) {
      if (action === "status" && (pendingAction !== "status" || changed)) {
        // A transaction may complete while the purchase/price reply is still
        // in flight. Do not lose that notification by sharing the older reply.
        if (!queuedRefresh)
          queuedRefresh = pending
            .then(() => request("status"))
            .finally(() => {
              queuedRefresh = null;
            });
        return queuedRefresh;
      }
      if (action === "products" && pendingAction === "status")
        return pending.then(() => request(action));
      return pending;
    }
    pendingAction = action;
    pending = perform(action).finally(() => {
      pending = null;
      pendingAction = "";
    });
    return pending;
  }
  async function perform(action) {
    if (!bridge) return publish({ ready: true, result: "unavailable" });
    const ticket = ++sequence;
    if (action !== "status") publish({ busy: true, result: "working" });
    try {
      // Native is authoritative. Transport errors never launch a second purchase.
      // Purchase sheets may remain open until the user acts.
      const response = await bridge.postMessage({ action });
      if (ticket !== sequence) return state;
      if (
        !response ||
        response.productId !== FULL_PRODUCT_ID ||
        typeof response.unlocked !== "boolean" ||
        typeof response.ready !== "boolean"
      )
        throw new Error("Invalid store response");
      return publish({
        ready: response.ready,
        unlocked: response.unlocked,
        available: response.available === true,
        price:
          typeof response.price === "string" ? response.price.slice(0, 80) : "",
        result: [
          "ready",
          "owned",
          "purchased",
          "restored",
          "notFound",
          "pending",
          "cancelled",
          "failed",
          "unavailable",
          "checking",
          "busy",
        ].includes(response.result)
          ? action === "status" && response.result === "owned" && response.unlocked && state.unlocked && ["purchased", "restored"].includes(state.result)
            ? state.result
            : response.result
          : "failed",
        busy: false,
      });
    } catch {
      return publish({ ready: true, busy: false, result: "failed" });
    }
  }
  return {
    get state() {
      return state;
    },
    refresh: ({ changed = false } = {}) => request("status", changed),
    products: () => request("products"),
    purchase: () => request("purchase"),
    restore: () => request("restore"),
  };
}
