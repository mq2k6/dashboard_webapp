import { useState } from 'react';

/**
 * Two uses, same form: (1) shown when an app has just been checked in the
 * multi-select but has no url/display_name yet -- Docker can't tell us that,
 * see AppHub's comment on the auto-guess -- and (2) shown when editing an
 * app that's already configured, e.g. because its URL was wrong or guessed
 * incorrectly. `initialValues` is undefined for case 1 (blank form) and the
 * existing app object for case 2 (pre-filled, so the user only edits what's
 * actually wrong instead of retyping everything).
 */
export default function AppEditForm({ containerName, guessedUrl, initialValues, onSave, onCancel }) {
  const [displayName, setDisplayName] = useState(initialValues?.display_name ?? containerName);
  const [url, setUrl] = useState(initialValues?.url ?? guessedUrl ?? '');
  const [icon, setIcon] = useState(initialValues?.icon ?? '');

  const isEditing = Boolean(initialValues);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url) return;
    onSave({ display_name: displayName, url, icon: icon || null });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-accent/40 rounded-xl p-4 grid grid-cols-2 gap-3">
      <div className="col-span-2 text-sm text-gray-400">
        {isEditing ? 'Edit' : 'Set up'} <span className="text-gray-200 font-medium">{containerName}</span>
        {isEditing ? '' : ' for the grid'}
      </div>
      <input
        className="bg-black/30 border border-border rounded-lg px-3 py-2 text-sm"
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <input
        className="bg-black/30 border border-border rounded-lg px-3 py-2 text-sm"
        placeholder="URL (e.g. http://192.168.1.50:8096)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <input
        className="bg-black/30 border border-border rounded-lg px-3 py-2 text-sm col-span-2"
        placeholder="Icon URL (optional)"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
      />
      <div className="col-span-2 flex gap-2">
        <button type="submit" className="flex-1 bg-accent/20 text-accent border border-accent/40 rounded-lg py-2 text-sm hover:bg-accent/30">
          Save
        </button>
        <button type="button" onClick={onCancel} className="flex-1 border border-border rounded-lg py-2 text-sm hover:bg-surface-hover">
          Cancel
        </button>
      </div>
    </form>
  );
}
