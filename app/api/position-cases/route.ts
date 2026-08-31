import {
  summarizeClosedPositionCases,
  withClosedPositionMarketOutcome,
  type ClosedPositionCase,
} from "../../../lib/position-transactions";
import { getMarketCandles } from "../../../lib/market-data";
import {
  createVercelGuestStore,
  isVercelRequest,
} from "../../../lib/vercel-guest-store";

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

function addMarketOutcomes(cases: ClosedPositionCase[]) {
  return cases.map((closedCase) =>
    withClosedPositionMarketOutcome(
      closedCase,
      getMarketCandles(closedCase.symbol, "day", "adjusted") ?? [],
    ),
  );
}

export async function GET(request: Request) {
  try {
    if (isVercelRequest(request)) {
      const store = createVercelGuestStore(request);
      const cases = addMarketOutcomes(store
        .read<ClosedPositionCase[]>("position_cases", [])
        .slice()
        .sort((left, right) => right.closedAt.localeCompare(left.closedAt)));
      return store.json({
        summary: summarizeClosedPositionCases(cases),
        cases: cases.slice(0, 50),
      });
    }
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const storedCases = isLocalDevelopment(new URL(request.url))
      ? await (
          await import("../../../lib/closed-position-case-store.local")
        ).listLocalClosedPositionCases(ownerId)
      : await (
          await import("../../../lib/closed-position-case-store.d1")
        ).listD1ClosedPositionCases(ownerId);
    const cases = addMarketOutcomes(storedCases);
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
