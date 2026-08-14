import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClosedPositionCase } from "./position-transactions";

interface LocalClosedPositionCase extends ClosedPositionCase {
  id: string;
  ownerId: string;
}

const localDirectory = path.join(process.cwd(), ".local");
const localFile = path.join(localDirectory, "closed-position-cases.json");

async function readCases(): Promise<LocalClosedPositionCase[]> {
  try {
    return JSON.parse(await readFile(localFile, "utf8")) as LocalClosedPositionCase[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeCases(cases: LocalClosedPositionCase[]) {
  await mkdir(localDirectory, { recursive: true });
  await writeFile(localFile, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
}

export async function saveLocalClosedPositionCase(
  ownerId: string,
  closedCase: ClosedPositionCase,
) {
  const cases = await readCases();
  const id = `${ownerId}:${closedCase.caseKey}`;
  const next = cases.filter((item) => item.id !== id);
  next.push({ id, ownerId, ...closedCase });
  await writeCases(next);
}

export async function listLocalClosedPositionCases(ownerId: string) {
  return (await readCases())
    .filter((item) => item.ownerId === ownerId)
    .map(({ id, ownerId: storedOwnerId, ...item }) => {
      void id;
      void storedOwnerId;
      return item;
    })
    .sort((left, right) => right.closedAt.localeCompare(left.closedAt));
}
