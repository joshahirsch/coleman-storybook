"use client";

import { useState, useTransition } from "react";
import { updateAdminReviewAction } from "@/lib/actions/admin-actions";

export function ReviewPanel({
  submissionId,
  initialEditorialState,
  initialFavorite,
  initialNotes,
}: {
  submissionId: string;
  initialEditorialState: "PENDING" | "APPROVED" | "REJECTED";
  initialFavorite: boolean;
  initialNotes: string;
}) {
  const [editorialState, setEditorialState] = useState(initialEditorialState);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function setEditorial(next: "PENDING" | "APPROVED" | "REJECTED") {
    setEditorialState(next);
    startTransition(async () => {
      const result = await updateAdminReviewAction({ submissionId, editorialState: next });
      setMessage(result.ok ? null : result.error ?? "Failed to update.");
    });
  }

  function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    startTransition(async () => {
      const result = await updateAdminReviewAction({ submissionId, favorite: next });
      setMessage(result.ok ? null : result.error ?? "Failed to update.");
    });
  }

  function saveNotes() {
    startTransition(async () => {
      const result = await updateAdminReviewAction({ submissionId, notes });
      if (result.ok) {
        setSavedNotes(notes);
        setMessage(null);
      } else {
        setMessage(result.error ?? "Failed to save notes.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Editorial review</h2>
        <button
          onClick={toggleFavorite}
          disabled={pending}
          aria-pressed={favorite}
          className={`rounded-full px-3 py-1 text-sm font-medium ${favorite ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}
        >
          {favorite ? "★ Favorited" : "☆ Favorite"}
        </button>
      </div>

      <div className="flex gap-2">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setEditorial(s)}
            disabled={pending}
            aria-pressed={editorialState === s}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              editorialState === s ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {s === "APPROVED" ? "Approve for marketing use" : s === "REJECTED" ? "Reject" : "Pending"}
          </button>
        ))}
      </div>

      <label className="text-sm font-medium text-gray-700">
        Internal notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      {notes !== savedNotes && (
        <button
          onClick={saveNotes}
          disabled={pending}
          className="self-start rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Save notes
        </button>
      )}

      {message && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
