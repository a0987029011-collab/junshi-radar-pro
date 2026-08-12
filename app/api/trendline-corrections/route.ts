import {
  normalizeTrendlineCorrectionInput,
  type TrendlineCorrectionAdjustment,
  type TrendlineCorrectionTimeframe,
} from "../../../lib/trendline-corrections";

const USER_ID_HEADER = "oai-authenticated-user-id";
const LOCAL_OWNER_ID = "local-dev";

type CorrectionInput = ReturnType<typeof normalizeTrendlineCorrectionInput>;
type CorrectionStore = {
  get(
    ownerId: string,
    symbol: string,
    timeframe: TrendlineCorrectionTimeframe,
    adjustment: TrendlineCorrectionAdjustment,
  ): Promise<unknown>;
  save(ownerId: string, input: CorrectionInput): Promise<unknown>;
  remove(
    ownerId: string,
    symbol: string,
    timeframe: TrendlineCorrectionTimeframe,
    adjustment: TrendlineCorrectionAdjustment,
  ): Promise<boolean>;
};

function isLocalHost(url: URL) {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

function getOwnerId(request: Request) {
  const userId = request.headers.get(USER_ID_HEADER)?.trim();
  if (userId) return userId;
  return isLocalHost(new URL(request.url)) ? LOCAL_OWNER_ID : null;
}

async function getStore(request: Request): Promise<CorrectionStore> {
  if (isLocalHost(new URL(request.url))) {
    const local = await import("../../../lib/trendline-correction-store.local");
    return {
      get: local.getLocalTrendlineCorrection,
      save: local.saveLocalTrendlineCorrection,
      remove: local.deleteLocalTrendlineCorrection,
    };
  }

  const d1 = await import("../../../lib/trendline-correction-store.d1");
  return {
    get: d1.getD1TrendlineCorrection,
    save: d1.saveD1TrendlineCorrection,
    remove: d1.deleteD1TrendlineCorrection,
  };
}

function readLookup(url: URL) {
  return normalizeTrendlineCorrectionInput({
    symbol: url.searchParams.get("symbol"),
    timeframe: url.searchParams.get("timeframe"),
    adjustment: url.searchParams.get("adjustment"),
    h1: { date: "2000-01-01", price: 2 },
    h2: { date: "2000-01-02", price: 1 },
    originalH1: null,
    originalH2: null,
    reason: "其他",
    notes: "",
    submittedForLearning: false,
  });
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "趨勢線校正處理失敗";
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      return Response.json({ error: "請先登入後再讀取校正" }, { status: 401 });
    }
    const lookup = readLookup(new URL(request.url));
    const correction = await (await getStore(request)).get(
      ownerId,
      lookup.symbol,
      lookup.timeframe,
      lookup.adjustment,
    );
    return Response.json({ correction });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      return Response.json({ error: "請先登入後再儲存校正" }, { status: 401 });
    }
    const input = normalizeTrendlineCorrectionInput(await request.json());
    const correction = await (await getStore(request)).save(ownerId, input);
    return Response.json({ correction });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) {
      return Response.json({ error: "請先登入後再刪除校正" }, { status: 401 });
    }
    const lookup = readLookup(new URL(request.url));
    const deleted = await (await getStore(request)).remove(
      ownerId,
      lookup.symbol,
      lookup.timeframe,
      lookup.adjustment,
    );
    return Response.json({ deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
