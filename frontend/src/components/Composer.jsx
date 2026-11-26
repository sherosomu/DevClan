import React, { useState } from "react";
import { apiFetch } from "../api";

export default function Composer({ onPosted }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !title.trim() || !content.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        }),
      });
      if (res.status === 429) throw new Error("Slow down - rate limit hit. Try again shortly.");
      if (!res.ok) throw new Error("Could not publish post");
      setTitle("");
      setContent("");
      setTags("");
      onPosted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full bg-[#0f172a] border border-[#334155] rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500";

  return (
    <form onSubmit={submit} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 space-y-2">
      <input className={input} placeholder="Title" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      <textarea className={input} placeholder="What are you working on?" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="flex gap-2">
        <input className={input} placeholder="tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 bg-[#0284c7] hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {busy ? "Posting..." : "Post"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </form>
  );
}
