import React, { useState } from 'react';
import { X, Sparkles, Image, Shield, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

export interface LeagueBranding {
  leagueName: string;
  venueName: string;
  logoUrl: string;
  sponsorTagline: string;
  accentColor: 'blue' | 'amber' | 'emerald' | 'purple' | 'rose';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  currentBranding: LeagueBranding;
  onSaveBranding: (updated: LeagueBranding) => void;
}

const COLOR_THEMES = [
  { id: 'blue', name: 'Electric Blue', ring: 'ring-blue-500', bg: 'bg-blue-600', text: 'text-blue-400' },
  { id: 'amber', name: 'Championship Gold', ring: 'ring-amber-500', bg: 'bg-amber-500', text: 'text-amber-400' },
  { id: 'emerald', name: 'Courtside Green', ring: 'ring-emerald-500', bg: 'bg-emerald-500', text: 'text-emerald-400' },
  { id: 'purple', name: 'Royal Purple', ring: 'ring-purple-500', bg: 'bg-purple-600', text: 'text-purple-400' },
  { id: 'rose', name: 'Fire Crimson', ring: 'ring-rose-500', bg: 'bg-rose-600', text: 'text-rose-400' },
] as const;

export const LeagueBrandingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  sessionId,
  currentBranding,
  onSaveBranding,
}) => {
  const [formData, setFormData] = useState<LeagueBranding>(currentBranding);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Sync customized branding straight to the organizations table in Supabase
      await supabase
        .from('organizations')
        .update({
          name: formData.leagueName,
          venue: formData.venueName,
          branding: {
            logoUrl: formData.logoUrl,
            sponsorTagline: formData.sponsorTagline,
            accentColor: formData.accentColor,
          },
        })
        .eq('id', sessionId);

      onSaveBranding(formData);
      onClose();
    } catch (err) {
      console.error('Error saving branding:', err);
      // Still apply locally if offline
      onSaveBranding(formData);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-tight">
                League White-Labeling & Branding
              </h3>
              <p className="text-[11px] text-slate-400">
                Personalize the arena display, reports, and navbar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-5">
          {/* Live Preview Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Live Brand Preview
            </span>
            <div className="flex items-center gap-3">
              <img
                src={formData.logoUrl || '/epic-logo.png'}
                alt="Logo Preview"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/epic-logo.png';
                }}
                className="w-12 h-12 rounded-2xl border border-slate-700 object-cover bg-slate-900"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black text-white truncate uppercase">
                  {formData.leagueName || 'Your League Title'}
                </h4>
                <p className="text-[10px] text-slate-400 truncate">
                  {formData.venueName || 'Main Arena Venue'}
                </p>
                {formData.sponsorTagline && (
                  <span className="text-[9px] font-bold text-amber-400/90 tracking-wide uppercase mt-0.5 inline-block truncate">
                    ★ {formData.sponsorTagline}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-400 mb-1">League / Tournament Title</label>
              <input
                type="text"
                required
                value={formData.leagueName}
                onChange={(e) => setFormData({ ...formData, leagueName: e.target.value })}
                placeholder="e.g. 2026 Palarong Bayan Championship"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1">Venue / Gymnasium Subtitle</label>
              <input
                type="text"
                required
                value={formData.venueName}
                onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
                placeholder="e.g. Municipal Sports Complex • Court 1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1 flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5 text-blue-400" />
                Custom League Logo URL
              </label>
              <input
                type="url"
                value={formData.logoUrl}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://your-domain.com/league-logo.png"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-[11px] placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Leave empty to use the default EPIC Sports icon.</p>
            </div>

            <div>
              <label className="block font-bold text-slate-400 mb-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                Sponsor Tagline / Ad Slot (Monetization)
              </label>
              <input
                type="text"
                value={formData.sponsorTagline}
                onChange={(e) => setFormData({ ...formData, sponsorTagline: e.target.value })}
                placeholder="e.g. Sponsored by Nike Philippines & Gatorade"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Accent Theme Selection */}
            <div>
              <label className="block font-bold text-slate-400 mb-2">Primary Accent Color</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {COLOR_THEMES.map((theme) => {
                  const isSelected = formData.accentColor === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, accentColor: theme.id as any })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] font-bold transition cursor-pointer ${
                        isSelected
                          ? `border-white/50 bg-slate-800 text-white ring-2 ${theme.ring}`
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full ${theme.bg} flex items-center justify-center`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </div>
                      <span className="truncate w-full text-center">{theme.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-xs shadow-lg shadow-blue-500/20 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isSaving ? 'Saving Changes...' : 'Save League Brand'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};