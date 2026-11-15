// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
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
  if (place.stop) return place.stop.id; // a station or stop: its slug, as in #from=hannover-hauptbahnhof
  if (place.service) return place.service.id; // a service: #to=international-office
  return place.type === "room" ? place.room.id : place.building.id;
}

/**
 * URL of a pre-filled GitHub issue for the route from → to.
 * opts: appUrl (the app without hash), avoidSteps, found (a route was shown),
 * text: {title(from, to), body: [lines…], whatWrong} in the user's language,
 * comment: {category, step, message} from the comment form (all optional): the person's own words.
 */
export function reportUrl(from, to, { appUrl, avoidSteps = false, found = true, text, comment = null }) {
  const a = placeId(from);
  const b = placeId(to);
  const h = new URLSearchParams({ from: a, to: b });
  if (avoidSteps) h.set("steps", "0");
  const body = [
    `- From: \`${a}\``,
    `- To: \`${b}\``,
    `- Avoid steps: ${avoidSteps ? "yes" : "no"}`,
    `- Route found: ${found ? "yes" : "no"}`,
    ...(comment?.category ? [`- About: ${comment.category}`] : []),
    ...(comment?.step ? [`- Step: ${comment.step}`] : []), // the number only: the sentence may name a person
    `- Open in the app: ${appUrl}#${h}`,
    "",
    `### ${text.whatWrong}`,
    "",
    ...(comment?.message?.trim() ? [comment.message.trim(), ""] : text.body),
  ].join("\n");
  return `${ISSUES_URL}?${new URLSearchParams({ title: text.title(a, b), body })}`;
}
// @license-end
