import {
  getScannableSnapshotProfiles,
  marketSnapshotMeta,
} from "../../../lib/market-data";
import {
  buildSignalResearchObservations,
  selectSuccessfulSignalCases,
  summarizeSignalResearch,
  type SignalResearchObservation,
} from "../../../lib/signal-research";

const USER_ID_HEADER = "oai-authenticated-user-id";
const LOCAL_OWNER_ID = "local-dev";
const PROFILE_CHUNK_SIZE = 20;

let localObservationCache: SignalResearchObservation[] | null = null;

function isLocalDevelopment(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function getOwnerId(request: Request) {
  const userId = request.headers.get(USER_ID_HEADER)?.trim();
  if (userId) return userId;
  return isLocalDevelopment(new URL(request.url)) ? LOCAL_OWNER_ID : null;
}

function localObservations() {
  localObservationCache ??= buildSignalResearchObservations(
    getScannableSnapshotProfiles(),
  );
  return localObservationCache;
}

function responsePayload(observations: SignalResearchObservation[]) {
  const recentCases = observations
    .slice()
    .sort((left, right) => right.signalDate.localeCompare(left.signalDate))
    .slice(0, 20);
  return {
    dataAsOf: marketSnapshotMeta.dataAsOf,
    generatedAt: marketSnapshotMeta.generatedAt,
    summary: summarizeSignalResearch(observations),
    successfulCases: selectSuccessfulSignalCases(observations),
    recentCases,
  };
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

    if (isLocalDevelopment(new URL(request.url))) {
      return Response.json(responsePayload(localObservations()));
    }

    const { listD1SignalResearchObservations } = await import(
      "../../../lib/signal-research-store.d1"
    );
    const observations = await listD1SignalResearchObservations(ownerId);
    return Response.json(responsePayload(observations));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const profiles = getScannableSnapshotProfiles();

    if (isLocalDevelopment(new URL(request.url))) {
      const observations = localObservations();
      return Response.json({
        completed: true,
        nextProfileIndex: profiles.length,
        totalProfiles: profiles.length,
        observationCount: observations.length,
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
    const observations = buildSignalResearchObservations(selectedProfiles);
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
