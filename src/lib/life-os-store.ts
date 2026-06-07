import { promises as fs } from "node:fs";
import path from "node:path";
import type { LifeOsTask, LifeOsTransaction } from "@/lib/life-os-types";

type LifeOsStore = {
  nextTaskId: number;
  nextTransactionId: number;
  tasks: LifeOsTask[];
  transactions: LifeOsTransaction[];
};

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "life-os.json");

function buildDefaultStore(): LifeOsStore {
  return {
    nextTaskId: 1,
    nextTransactionId: 1,
    tasks: [],
    transactions: [],
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(buildDefaultStore(), null, 2), "utf-8");
  }
}

export async function readLifeOsStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf-8");
  const parsed = JSON.parse(raw) as Partial<LifeOsStore>;
  const fallback = buildDefaultStore();

  return {
    nextTaskId: typeof parsed.nextTaskId === "number" ? parsed.nextTaskId : fallback.nextTaskId,
    nextTransactionId:
      typeof parsed.nextTransactionId === "number" ? parsed.nextTransactionId : fallback.nextTransactionId,
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : fallback.transactions,
  } satisfies LifeOsStore;
}

export async function writeLifeOsStore(store: LifeOsStore) {
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2), "utf-8");
}
