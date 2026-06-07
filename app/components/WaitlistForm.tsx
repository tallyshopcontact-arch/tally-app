"use client";

import { useState } from "react";

const GENRES = [
  "Trap",
  "Drill",
  "Lo-fi",
  "R&B / Soul",
  "Hip-Hop",
  "Afrobeats",
  "House / Electronic",
  "Pop",
  "Boom Bap",
  "Jazz",
  "Other",
];

interface FormState {
  name: string;
  email: string;
  genre: string;
  channel: string;
}

export default function WaitlistForm() {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    genre: "",
    channel: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((res) => setTimeout(res, 700));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="border border-[#1e1e1e] p-8">
        <div className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
          You&apos;re in
        </div>
        <p className="text-2xl font-bold mb-3">We&apos;ll be in touch.</p>
        <p className="text-[#94a3b8] text-sm leading-relaxed">
          You&apos;re on the waitlist. We onboard producers in batches — when
          your spot opens, you&apos;ll hear from us first. Keep making beats.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";
  const labelClass =
    "block text-xs text-[#94a3b8] uppercase tracking-widest mb-2";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          type="text"
          name="name"
          required
          value={form.name}
          onChange={handleChange}
          placeholder="Your name"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          required
          value={form.email}
          onChange={handleChange}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="genre" className={labelClass}>
          Genre
        </label>
        <select
          id="genre"
          name="genre"
          required
          value={form.genre}
          onChange={handleChange}
          className={`${inputClass} appearance-none cursor-pointer`}
        >
          <option value="" disabled>
            Select your genre
          </option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="channel" className={labelClass}>
          YouTube Channel Link
        </label>
        <input
          id="channel"
          type="url"
          name="channel"
          required
          value={form.channel}
          onChange={handleChange}
          placeholder="https://youtube.com/@yourchannel"
          className={inputClass}
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Join the waitlist"}
        </button>
      </div>
    </form>
  );
}
