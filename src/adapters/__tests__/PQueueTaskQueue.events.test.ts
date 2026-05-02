import { PQueueTaskQueue } from "../PQueueTaskQueue";
import { HarvestTask } from "../../core/ports/ITaskQueue";

function makeTask(id: string): HarvestTask {
  return { id, site: "test", url: "https://example.com", units: ["unit1", "unit2"] };
}

describe("PQueueTaskQueue events", () => {
  describe("queue:changed", () => {
    it("emits on enqueue with pending count", (done) => {
      const queue = new PQueueTaskQueue(1);
      queue.setProcessor(async (_task) => {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true };
      });
      queue.on("queue:changed", (status) => {
        // First call is from enqueue (pending=1)
        if (status.pending === 1 && status.running === 0) {
          done();
        }
      });
      queue.enqueue(makeTask("t1"));
    });

    it("emits on task completion", (done) => {
      const queue = new PQueueTaskQueue(1);
      queue.setProcessor(async (_task) => {
        return { ok: true };
      });
      let changeCount = 0;
      queue.on("queue:changed", (status) => {
        changeCount++;
        // 3rd change: task completed, pending=0, running=0, completed=1
        if (changeCount === 3 && status.completed === 1) {
          done();
        }
      });
      queue.enqueue(makeTask("t1"));
    });
  });

  describe("task:started", () => {
    it("emits with task details when processing begins", (done) => {
      const queue = new PQueueTaskQueue(1);
      queue.setProcessor(async (_task) => {
        return { ok: true };
      });
      queue.on("task:started", (data) => {
        expect(data.taskId).toBe("t1");
        expect(data.site).toBe("test");
        expect(data.units).toEqual(["unit1", "unit2"]);
        done();
      });
      queue.enqueue(makeTask("t1"));
    });
  });

  describe("task:completed", () => {
    it("emits when task succeeds", (done) => {
      const queue = new PQueueTaskQueue(1);
      queue.setProcessor(async (task) => {
        return { taskId: task.id, ok: true };
      });
      queue.on("task:completed", (data) => {
        expect(data.taskId).toBe("t1");
        expect(data.result).toEqual({ taskId: "t1", ok: true });
        done();
      });
      queue.enqueue(makeTask("t1"));
    });
  });

  describe("task:failed", () => {
    it("emits when task throws", (done) => {
      const queue = new PQueueTaskQueue(1);
      queue.setProcessor(async () => { throw new Error("oops"); });
      queue.on("task:failed", (data) => {
        expect(data.taskId).toBe("t2");
        expect(data.error).toBe("oops");
        done();
      });
      queue.enqueue(makeTask("t2"));
    });
  });
});
