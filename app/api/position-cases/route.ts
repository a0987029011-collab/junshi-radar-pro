import { summarizeClosedPositionCases } from "../../../lib/position-transactions";

const USER_ID_HEADER = "oai-authenticated-user-id";
const LOCAL_OWNER_ID = "local-dev";

function isLocalDevelopment(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function getOwnerId(request: Request) {
  const userId = request.headers.get(USER_ID_HEADER)?.trim();
  if (userId) return userId;
  return isLocalDevelopment(new URL(request.url)) ? LOCAL_OWNER_ID : null;
}

export async function GET(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const cases = isLocalDevelopment(new URL(request.url))
      ? await (
          await import("../../../lib/closed-position-case-store.local")
        ).listLocalClosedPositionCases(ownerId)
      : await (
          await import("../../../lib/closed-position-case-store.d1")
        ).listD1ClosedPositionCases(ownerId);
    return Response.json({
      summary: summarizeClosedPositionCases(cases),
      cases: cases.slice(0, 50),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "持股結案研究讀取失敗",
      },
      { status: 500 },
    );
  }
}
