import precomputedPayloadJson from "../../../data/signal-research-payload.json" with {
  type: "json",
};
import type { SignalResearchPayload } from "../../../lib/signal-research-payload";

const USER_ID_HEADER = "oai-authenticated-user-id";
const LOCAL_OWNER_ID = "local-dev";
const PROFILE_CHUNK_SIZE = 20;

const precomputedPayload = precomputedPayloadJson as SignalResearchPayload;

function isLocalDevelopment(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function getOwnerId(request: Request) {
  const userId = request.headers.get(USER_ID_HEADER)?.trim();
  if (userId) return userId;
  return isLocalDevelopment(new URL(request.url)) ? LOCAL_OWNER_ID : null;
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "訊號研究資料處理失敗";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });

    return Response.json(precomputedPayload);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const [{ getScannableSnapshotProfiles, marketSnapshotMeta }, research] =
      await Promise.all([
        import("../../../lib/market-data"),
        import("../../../lib/signal-research"),
      ]);
    const profiles = getScannableSnapshotProfiles();

    if (isLocalDevelopment(new URL(request.url))) {
      return Response.json({
        completed: true,
        nextProfileIndex: profiles.length,
        totalProfiles: profiles.length,
        observationCount: precomputedPayload.summary.totalSamples,
      });
    }

    const {
      getD1SignalResearchSync,
      saveD1SignalResearchSync,
      upsertD1SignalResearchObservations,
    } = await import("../../../lib/signal-research-store.d1");
    const snapshotGeneratedAt = marketSnapshotMeta.generatedAt;
    const previous = await getD1SignalResearchSync(
      ownerId,
      snapshotGeneratedAt,
    );
    if (previous?.completed) {
      return Response.json({
        ...previous,
        totalProfiles: profiles.length,
      });
    }

    const startIndex = previous?.nextProfileIndex ?? 0;
    const selectedProfiles = profiles.slice(
      startIndex,
      startIndex + PROFILE_CHUNK_SIZE,
    );
    const observations = research.buildSignalResearchObservations(selectedProfiles);
    await upsertD1SignalResearchObservations(ownerId, observations);

    const nextProfileIndex = Math.min(
      startIndex + selectedProfiles.length,
      profiles.length,
    );
    const completed = nextProfileIndex >= profiles.length;
    const observationCount =
      (previous?.observationCount ?? 0) + observations.length;
    await saveD1SignalResearchSync(ownerId, snapshotGeneratedAt, {
      nextProfileIndex,
      completed,
      observationCount,
    });

    return Response.json({
      completed,
      nextProfileIndex,
      totalProfiles: profiles.length,
      observationCount,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
