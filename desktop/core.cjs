const { open, mkdir, readFile, rename, stat, unlink } = require("node:fs/promises");
const { dirname, join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { validateAiPlan } = require("./gemini.cjs");

const MAX_PLANS = 200;
const MAX_STORE_BYTES = 5 * 1024 * 1024;
const SCHEMA_VERSION = 2;

function hasExactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function normalizeAiPlan(plan) {
  if (
    !validateAiPlan(plan) ||
    typeof plan.provider !== "string" ||
    plan.provider.length > 80 ||
    typeof plan.model !== "string" ||
    plan.model.length > 80
  ) {
    throw new Error("The AI planner returned an invalid plan.");
  }
  return {
    provider: plan.provider,
    model: plan.model,
    title: plan.title,
    summary: plan.summary,
    tasks: plan.tasks.map((task) => ({
      title: task.title,
      description: task.description,
      category: task.category,
      estimatedHours: task.estimatedHours,
      priority: task.priority,
    })),
  };
}

function isValidPlan(plan) {
  return (
    hasExactKeys(plan, ["id", "idea", "daysAvailable", "createdAt", "aiPlan"]) &&
    /^[0-9a-f-]{36}$/i.test(plan.id) &&
    typeof plan.idea === "string" &&
    Buffer.byteLength(plan.idea, "utf8") <= 4000 &&
    Number.isInteger(plan.daysAvailable) &&
    plan.daysAvailable >= 1 &&
    plan.daysAvailable <= 30 &&
    typeof plan.createdAt === "string" &&
    Number.isFinite(Date.parse(plan.createdAt)) &&
    hasExactKeys(plan.aiPlan, ["provider", "model", "title", "summary", "tasks"]) &&
    validateAiPlan(plan.aiPlan) &&
    plan.aiPlan.tasks.every((task) =>
      hasExactKeys(task, ["title", "description", "category", "estimatedHours", "priority"]),
    ) &&
    typeof plan.aiPlan.provider === "string" &&
    plan.aiPlan.provider.length <= 80 &&
    typeof plan.aiPlan.model === "string" &&
    plan.aiPlan.model.length <= 80
  );
}

function isValidLegacyPlan(plan) {
  return (
    plan !== null &&
    typeof plan === "object" &&
    /^[0-9a-f-]{36}$/i.test(plan.id) &&
    typeof plan.idea === "string" &&
    Buffer.byteLength(plan.idea, "utf8") <= 4000 &&
    Number.isInteger(plan.daysAvailable) &&
    plan.daysAvailable >= 1 &&
    plan.daysAvailable <= 30 &&
    Number.isInteger(plan.daysNeeded) &&
    plan.daysNeeded >= 1 &&
    Number.isInteger(plan.totalTokens) &&
    plan.totalTokens >= 0 &&
    Array.isArray(plan.tasks) &&
    plan.tasks.length > 0 &&
    Array.isArray(plan.providers) &&
    Array.isArray(plan.schedule) &&
    typeof plan.feasible === "boolean" &&
    typeof plan.createdAt === "string" &&
    Number.isFinite(Date.parse(plan.createdAt)) &&
    ["planned", "complete"].includes(plan.state) &&
    (plan.aiPlan === undefined ||
      (validateAiPlan(plan.aiPlan) &&
        typeof plan.aiPlan.provider === "string" &&
        plan.aiPlan.provider.length <= 80 &&
        typeof plan.aiPlan.model === "string" &&
        plan.aiPlan.model.length <= 80)) &&
    (plan.report === null ||
      (plan.report !== null &&
        typeof plan.report === "object" &&
        plan.report.simulated === true &&
        Number.isInteger(plan.report.successRate) &&
        Number.isInteger(plan.report.tokensUsed) &&
        Number.isInteger(plan.report.daysTaken) &&
        Number.isInteger(plan.report.rateLimitErrors) &&
        Number.isInteger(plan.report.singleModelBaselineDays)))
  );
}

function validatePlans(plans) {
  if (!Array.isArray(plans) || plans.length > MAX_PLANS || !plans.every(isValidPlan)) {
    throw new Error("Saved NexRoute data is invalid or damaged.");
  }
  return plans;
}

function validateInput(idea, daysAvailable) {
  if (typeof idea !== "string" || !idea.trim() || Buffer.byteLength(idea.trim(), "utf8") > 4000) {
    throw new Error("Add a project brief of up to 4000 UTF-8 bytes.");
  }
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1 || daysAvailable > 30) {
    throw new Error("Choose a target deadline between 1 and 30 days.");
  }
  return idea.trim();
}

function createPlanner({ storePath, aiGenerator }) {
  if (typeof storePath !== "string" || typeof aiGenerator !== "function") {
    throw new TypeError("Planner requires a data file path and an AI planner.");
  }

  let writeQueue = Promise.resolve();
  let discardedLegacyPlans = 0;
  const serialize = (operation) => {
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => {});
    return result;
  };

  async function savePlans(plans) {
    validatePlans(plans);
    const directory = dirname(storePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(directory, `.plans-${randomUUID()}.tmp`);
    const file = await open(temporaryPath, "wx", 0o600);
    let renamed = false;
    try {
      await file.writeFile(
        `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, plans }, null, 2)}\n`,
        "utf8",
      );
      await file.sync();
      await file.close();
      await rename(temporaryPath, storePath);
      renamed = true;
    } finally {
      if (renamed === false) {
        await file.close().catch(() => {});
        await unlink(temporaryPath).catch(() => {});
      }
    }
  }

  async function loadPlans() {
    let store;
    try {
      const fileInfo = await stat(storePath);
      if (fileInfo.size > MAX_STORE_BYTES) {
        throw new Error("Saved NexRoute data exceeds the supported size limit.");
      }
      store = JSON.parse(await readFile(storePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }

    if (store === null || typeof store !== "object" || Array.isArray(store)) {
      throw new Error("Saved NexRoute data is invalid or damaged.");
    }
    if (store.schemaVersion === SCHEMA_VERSION) return validatePlans(store.plans);
    if (store.schemaVersion !== 1 || !Array.isArray(store.plans) || store.plans.length > MAX_PLANS) {
      throw new Error("Saved NexRoute data is invalid or damaged.");
    }
    if (!store.plans.every(isValidLegacyPlan)) {
      throw new Error("Saved NexRoute data is invalid or damaged.");
    }

    const plans = store.plans
      .filter((plan) => plan.aiPlan && validateAiPlan(plan.aiPlan))
      .map((plan) => ({
        id: plan.id,
        idea: plan.idea,
        daysAvailable: plan.daysAvailable,
        createdAt: plan.createdAt,
        aiPlan: normalizeAiPlan(plan.aiPlan),
      }));
    discardedLegacyPlans = store.plans.length - plans.length;
    await savePlans(plans);
    return plans;
  }

  return {
    async getPlans() {
      const plans = await loadPlans();
      const removedDemoPlans = discardedLegacyPlans;
      discardedLegacyPlans = 0;
      return { plans, removedDemoPlans };
    },

    async createPlan(idea, daysAvailable) {
      const cleanIdea = validateInput(idea, daysAvailable);
      const aiPlan = normalizeAiPlan(await aiGenerator(cleanIdea, daysAvailable));

      const plan = {
        id: randomUUID(),
        idea: cleanIdea,
        daysAvailable,
        createdAt: new Date().toISOString(),
        aiPlan,
      };
      return serialize(async () => {
        const plans = await loadPlans();
        plans.unshift(plan);
        await savePlans(plans.slice(0, MAX_PLANS));
        return plan;
      });
    },

    async deletePlan(planId) {
      if (typeof planId !== "string" || !/^[0-9a-f-]{36}$/i.test(planId)) {
        throw new Error("Choose a valid project plan.");
      }
      return serialize(async () => {
        const plans = await loadPlans();
        const remaining = plans.filter((plan) => plan.id !== planId);
        if (remaining.length === plans.length) throw new Error("Project plan not found.");
        await savePlans(remaining);
        return { deleted: true };
      });
    },
  };
}

module.exports = { createPlanner, validateInput, validatePlans };
