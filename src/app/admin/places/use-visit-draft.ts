"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";

const names = ["happenedAt", "group", "whenLabel", "title", "content"];
type Draft = { values: Record<string, string>; revision: number; requestId?: string };

// 订阅浏览器会话草稿变化，服务端渲染阶段使用空快照。
function subscribeDrafts(onChange: () => void) {
  window.addEventListener("travel-draft-change", onChange);
  return () => window.removeEventListener("travel-draft-change", onChange);
}

// 服务器不读取浏览器本机草稿。
function serverSnapshot() { return null; }

// 交互控件在客户端初始化完成后开放，避免初始化覆盖刚输入的文字。
export function useEditorReady() {
  return useSyncExternalStore(subscribeDrafts, () => true, () => false);
}

// 直接读取控件值，禁用中的字段也能形成正确的草稿基线。
function formValues(form: HTMLFormElement) {
  return Object.fromEntries(names.map(name => {
    const control = form.elements.namedItem(name);
    const value = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement ? control.value : "";
    return [name, value];
  }));
}

// 只保存手记的可编辑文本与可选新建幂等号，草稿按账号和到访隔离在当前标签页。
export function useVisitDraft(
  form: RefObject<HTMLFormElement | null>,
  key: string,
  revision: number,
  onRestore: (values: Record<string, string>, requestId?: string) => void,
  requestId?: string,
) {
  const [dirty, setDirty] = useState(false);
  const [stored, setStored] = useState(false);
  const dirtyRef = useRef(false);
  const baseline = useRef("");
  const draftRevisionRef = useRef(revision);
  const draftRequestIdRef = useRef(requestId);
  const snapshot = useCallback(() => {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }, [key]);
  const raw = useSyncExternalStore(subscribeDrafts, snapshot, serverSnapshot);
  const draft = useMemo(() => {
    try {
      const saved = JSON.parse(raw || "null") as Draft | null;
      return !dirty && saved && typeof saved.revision === "number" && saved.values &&
        names.every(name => typeof saved.values[name] === "string") ? saved : null;
    } catch { return null; }
  }, [raw, dirty]);

  useEffect(() => {
    draftRevisionRef.current = revision;
    draftRequestIdRef.current = requestId;
  }, [revision, requestId]);

  useEffect(() => {
    if (!form.current) return;
    baseline.current = JSON.stringify(formValues(form.current));

    // 离开有未保存文字的编辑器前给出浏览器提醒。
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
    }

    // Next.js 的站内导航同样提醒，当前页内的锚点以及新标签/快捷键打开可直接使用。
    function beforeNavigate(event: MouseEvent) {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !dirtyRef.current ||
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) return;
      const url = new URL(anchor.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm("手记还有未保存的修改，确定离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [form, key]);

  // 每次输入即保存一份小型草稿，刷新页面后可主动恢复。
  function remember() {
    const current = formValues(form.current!);
    dirtyRef.current = JSON.stringify(current) !== baseline.current;
    setDirty(dirtyRef.current);
    try {
      if (dirtyRef.current) {
        const payload: Draft = {
          values: current,
          revision: draftRevisionRef.current,
          ...(draftRequestIdRef.current ? { requestId: draftRequestIdRef.current } : {}),
        };
        sessionStorage.setItem(key, JSON.stringify(payload));
      } else {
        sessionStorage.removeItem(key);
      }
      window.dispatchEvent(new Event("travel-draft-change"));
      setStored(dirtyRef.current);
    } catch { setStored(false); }
  }

  // 明确选择后再把草稿填入当前表单，保留草稿原始版本与新建幂等号。
  function restore() {
    if (!draft || !form.current) return;
    draftRevisionRef.current = draft.revision;
    if (draft.requestId) draftRequestIdRef.current = draft.requestId;
    for (const name of names) {
      const control = form.current.elements.namedItem(name);
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.value = draft.values[name];
    }
    onRestore(draft.values, draft.requestId);
    remember();
  }

  // 成功保存或主动丢弃后清除当前账号的草稿。
  function clear() {
    try { sessionStorage.removeItem(key); window.dispatchEvent(new Event("travel-draft-change")); } catch { /* 浏览器可能禁用了会话存储。 */ }
    dirtyRef.current = false;
    setDirty(false);
    setStored(false);
  }

  return { draft, dirty, stored, remember, restore, clear };
}
