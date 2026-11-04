// Missing values preserve the previously shipped open-team rule.
export const teamGuessing = settings => settings?.teamGuessing === "own" ? "own" : "open";
export const validTeamGuessing = settings => settings?.teamGuessing === undefined || ["own", "open"].includes(settings.teamGuessing);
