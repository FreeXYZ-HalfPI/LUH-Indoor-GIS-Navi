// SPDX-License-Identifier: GPL-3.0-or-later
// "Report a problem with this route": a link to a new GitHub issue, filled in
// with what is needed to reproduce the route and nothing else.
//
// Privacy: only place IDs go into the issue, never names. A person is reported
// as their office room (the room code is public, the person is not needed),
// and the app link is rebuilt from the IDs instead of copying the page URL,
// which may hold a person's name (#to=christian-heipke).

export const ISSUES_URL = "https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi/issues/new";

/** The public ID of a place: a room code ("1101.000.E028") or a building number ("1101"). */
export function placeId(place) {
  return place.type === "room" ? place.room.id : place.building.id;
}

/**
 * URL of a pre-filled GitHub issue for the route from → to.
 * opts: appUrl (the app without hash), avoidSteps, found (a route was shown),
 * text: {title(from, to), body: [lines…], whatWrong} in the user's language.
 */
export function reportUrl(from, to, { appUrl, avoidSteps = false, found = true, text }) {
  const a = placeId(from);
  const b = placeId(to);
  const h = new URLSearchParams({ from: a, to: b });
  if (avoidSteps) h.set("steps", "0");
  const body = [
    `- From: \`${a}\``,
    `- To: \`${b}\``,
    `- Avoid steps: ${avoidSteps ? "yes" : "no"}`,
    `- Route found: ${found ? "yes" : "no"}`,
    `- Open in the app: ${appUrl}#${h}`,
    "",
    `### ${text.whatWrong}`,
    "",
    ...text.body,
  ].join("\n");
  return `${ISSUES_URL}?${new URLSearchParams({ title: text.title(a, b), body })}`;
}
