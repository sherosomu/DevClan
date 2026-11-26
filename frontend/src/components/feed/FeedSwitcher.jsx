import React from "react";

const TABS = [
  { id: "hot", label: "Hot", icon: "🔥" },
  { id: "new", label: "New", icon: "✨" },
  { id: "top", label: "Top", icon: "📈" },
  { id: "following", label: "Following", icon: "👥" },
];

export default function FeedSwitcher({ currentTab, onTabChange }) {
  return (
    <div className="flex items-center gap-2 bg-[#1e293b] p-1.5 rounded-lg border border-[#334155] mb-4 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap ${
            currentTab === tab.id
              ? "bg-[#0284c7] text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <span>{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
