// Optional display metadata: never changes team membership, schedules or scores.
export const cleanTeamName = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 20);
export const validTeamNames = names => names === undefined || (Array.isArray(names) && names.length === 2 && names.every(name => typeof name === 'string' && name === cleanTeamName(name)));
export const displayTeamName = (settings, team, fallback) => validTeamNames(settings?.teamNames) && settings?.teamNames?.[team] || fallback;
