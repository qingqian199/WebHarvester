import { PQueueTaskQueue } from "./PQueueTaskQueue";

describe("PQueueTaskQueue", () => {
  it("enqueue adds task to pending", async () => {
    const q = new PQueueTaskQueue(10);
    await q.enqueue({ id: "1", site: "bilibili", url: "https://bilibili.com" });
    expect(q.getStatus().pending).toBe(1);
  });

  it("dequeue returns tasks in order", async () => {
    const q = new PQueueTaskQueue(10);
    await q.enqueue({ id: "1", site: "a", url: "https://a.com" });
    await q.enqueue({ id: "2", site: "b", url: "https://b.com" });
    const t1 = await q.dequeue();
    const t2 = await q.dequeue();
    expect(t1!.id).toBe("1");
    expect(t2!.id).toBe("2");
  });

  it("respects priority (lower number = higher priority)", async () => {
    const q = new PQueueTaskQueue(10);
    await q.enqueue({ id: "low", site: "a", url: "", priority: 10 });
    await q.enqueue({ id: "high", site: "b", url: "", priority: 1 });
    await q.enqueue({ id: "mid", site: "c", url: "", priority: 5 });
    const t1 = await q.dequeue();
    const t2 = await q.dequeue();
    const t3 = await q.dequeue();
    expect(t1!.id).toBe("high");
    expect(t2!.id).toBe("mid");
    expect(t3!.id).toBe("low");
  });

  it("onComplete updates counters and stores result", async () => {
    const q = new PQueueTaskQueue(10);
    q.onComplete("task-1", { data: "ok" });
    expect(q.getStatus().completed).toBe(1);
    expect(q.getResult("task-1")).toEqual({ data: "ok" });
  });

  it("onError updates counters and stores error", async () => {
    const q = new PQueueTaskQueue(10);
    q.onError("task-2", new Error("网络错误"));
    expect(q.getStatus().failed).toBe(1);
    expect(q.getError("task-2")).toBe("网络错误");
  });

  it("limits concurrency via maxConcurrency", async () => {
    const q = new PQueueTaskQueue(2);
    let concurrent = 0;
    let maxConcurrent = 0;
    q.setProcessor(async (_task) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return "done";
    });
    for (let i = 0; i < 6; i++) {
      await q.enqueue({ id: String(i), site: "t", url: "" });
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(q.getStatus().completed).toBe(6);
  });

  it("getStatus returns accurate counters", async () => {
    const q = new PQueueTaskQueue(10);
    q.setProcessor(async () => { await new Promise((r) => setTimeout(r, 5)); return "ok"; });
    await q.enqueue({ id: "a", site: "t", url: "" });
    await q.enqueue({ id: "b", site: "t", url: "" });
    // Both will be processed immediately since concurrency=10
    await new Promise((r) => setTimeout(r, 50));
    const st = q.getStatus();
    expect(st.completed).toBe(2);
    expect(st.pending).toBe(0);
  });

  it("returns null from dequeue when empty", async () => {
    const q = new PQueueTaskQueue(10);
    expect(await q.dequeue()).toBeNull();
  });
});
