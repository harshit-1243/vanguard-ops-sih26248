# API

All bodies are JSON and Zod-validated (400 with a path-specific message on failure).
Auth: `Authorization: Bearer <token>` (instructor token or player token). AAR export endpoints also
accept `?token=` so browser downloads work.

## REST

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| GET | `/healthz` | – | `{ok, store: "memory"\|"postgres", sessions, uptimeS}` |
| GET | `/api/scenarios` | – | `ScenarioSummary[]` |
| POST | `/api/sessions` | – | `{scenarioId, seed?, enabledRoles?}` → 201 `{code, pin, instructorToken}` |
| POST | `/api/sessions/:code/instructor` | – (5/min/IP) | `{pin}` → `{instructorToken}` · 401 wrong PIN · 429 |
| GET | `/api/sessions/:code/lobby` | – | `LobbyInfo` (roles: taken/takenBy/connected) |
| POST | `/api/sessions/:code/join` | – | `{roleId, callsign}` → `{playerToken, roleId, callsign}` · 409 taken/ended |
| GET | `/api/sessions/:code/me` | token | `{actor: "DS"\|RoleId, phase}` |
| GET | `/api/sessions/:code/briefing` | – | public brief, intent, terrain, objectives, features |
| GET | `/api/sessions/:code/aar` | DS any time · trainee after END | `AarReport` |
| GET | `/api/sessions/:code/aar.pdf` | same | `application/pdf` |
| GET | `/api/sessions/:code/events.json` | same | `{inputEvents, journal, stateHash}` |
| GET | `/api/sessions/:code/decisions.csv` | same | `text/csv`, one row per decision |
| GET | `/api/sessions/:code/replay?view=truth\|<role>&stepS=10` | same | `ReplayResponse` |
| POST | `/api/demo` | – (3/min/IP) | plays the scripted Iron Bridge demo to the end → `{code, pin, instructorToken}` |
| POST | `/api/sessions/:code/ai/report-variants` | DS | `{cell, unitType, count}` → contradictory pair (template or AI) |

## Socket.IO

Connect to `/socket.io` with `auth: {code, token}`. The server binds the socket to exactly one
actor resolved from the token; rooms: `s:<code>:ds` or `s:<code>:role:<roleId>` (+ `s:<code>:all`).

Server → client

| Event | To | Payload |
|---|---|---|
| `hello` | caller | `{actor, code}` |
| `picture` | trainee role room (every tick + on change) | `PerceivedPicture` |
| `ds:state` | DS room | `InstructorState` (ground truth) |
| `ds:viewAs` | the DS socket that asked | `PerceivedPicture \| null` |
| `lobby` | everyone in session | `LobbyInfo` |
| `ended` | everyone in session | `{code}` |

Client → server: `emit('cmd', command, ack)` → ack `{ok, error?}`.

- DS commands (`DsCommandSchema`): `START, PAUSE, RESUME, SET_SPEED{speed:1|2|4}, END, SET_INTENT{text},
  FIRE_INJECT{inject}, MSEL_FIRE_NOW{mselId}, MSEL_SKIP{mselId}, MSEL_EDIT{mselId, atS},
  PLACE_JAMMER{jammer}, MOVE_JAMMER{jammerId, cell}, TOGGLE_JAMMER{jammerId, active},
  REMOVE_JAMMER{jammerId}, TRIGGER_CYBER{cyber}, START_PROBE, END_PROBE, VIEW_AS{role|null},
  RELEASE_ROLE{role}`.
- Trainee commands (`TraineeCommandSchema`): `SEND_MESSAGE{channel, to[], text}, FORWARD_INTEL{itemId,
  channel, to[]}, FLAG_CONFLICT{itemIds[]}, REQUEST_VERIFICATION{itemId}, SWITCH_PACE{channel},
  MAKE_DECISION{decision}, UPDATE_INTENT{text} (CDR), FREQ_HOP{channel} (EW),
  ANSWER_PROBE{probeId, answers}`.

Every accepted command becomes exactly one input event (`StoredEvent`), appended to the log before
the next broadcast.
