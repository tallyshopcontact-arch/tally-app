"use client";
import { useState, useRef, useEffect } from "react";

const genres = [
  "Boom Bap",
  "Trap",
  "Drill",
  "Lo-fi",
  "Afrobeats",
  "Jersey Club",
  "UK Drill",
  "Pop Rap",
  "R&B",
  "Melodic Rap",
];

export default function GenreTags() {
  const [showInput, setShowInput] = useState(false);
  const [customGenre, setCustomGenre] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {genres.map((genre) => (
        <span
          key={genre}
          className="text-xs text-[#94a3b8] border border-[#1e1e1e] bg-[#0f0f0f] px-3 py-1.5 rounded-full hover:border-[#8B5CF6]/40 hover:text-white transition-colors"
        >
          {genre}
        </span>
      ))}
      {!showInput ? (
        <button
          onClick={() => setShowInput(true)}
          className="text-xs text-[#64748b] border border-[#1e1e1e] bg-[#0f0f0f] px-3 py-1.5 rounded-full hover:border-[#8B5CF6]/50 hover:text-[#8B5CF6] transition-colors cursor-pointer"
        >
          Other +
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={customGenre}
          onChange={(e) => setCustomGenre(e.target.value)}
          placeholder="Your genre…"
          className="text-xs text-white bg-[#0f0f0f] border border-[#8B5CF6]/40 px-3 py-1.5 rounded-full outline-none focus:border-[#8B5CF6]/70 w-32 transition-colors placeholder:text-[#475569]"
        />
      )}
    </div>
  );
}
