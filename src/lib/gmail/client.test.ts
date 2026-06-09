import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GmailClient } from "./client";
import type { GmailLabel } from "./types";

const label = (id: string, name: string): GmailLabel =>
  ({ id, name, type: "user" }) as unknown as GmailLabel;

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status = 200): Response {
  // For 204 we MUST pass null body — jsdom rejects any body with 204.
  return new Response(status === 204 ? null : "", { status });
}

function noContentResponse(): Response {
  return emptyResponse(204);
}

// Queue a sequence of responses; each call to fetch shifts the head and returns
// it. Falls back to an empty 200 if the queue runs out.
function withResponses(...responses: Response[]) {
  const queue = [...responses];
  fetchMock.mockImplementation(() => Promise.resolve(queue.shift() ?? emptyResponse()));
}

function calls(): { url: string; method: string }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: url as string,
    method: ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase(),
  }));
}

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(emptyResponse()));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function newClient(): GmailClient {
  return new GmailClient({ getToken: () => "fake-token" });
}

describe("GmailClient.listLabels", () => {
  it("primes the shared cache so subsequent ensureLabelId calls don't refetch", async () => {
    const labels = [label("L1", "INBOX"), label("L2", "Augment/Tags/Travel")];
    withResponses(jsonResponse({ labels }));

    const client = newClient();
    const res = await client.listLabels();
    expect(res.labels).toEqual(labels);
    expect(calls()).toHaveLength(1);

    // ensureLabelId for a name already in the response should reuse the cache.
    const id = await client.ensureLabelId("Augment/Tags/Travel");
    expect(id).toBe("L2");
    expect(calls()).toHaveLength(1); // no extra request
  });

  it("creates a label when ensureLabelId can't find it in the primed cache", async () => {
    withResponses(
      jsonResponse({ labels: [label("L1", "INBOX")] }),
      jsonResponse(label("L99", "Augment/Tags/New")),
    );

    const client = newClient();
    await client.listLabels();
    const id = await client.ensureLabelId("Augment/Tags/New");

    expect(id).toBe("L99");
    const log = calls();
    expect(log).toHaveLength(2);
    expect(log[1].url).toContain("/labels");
    expect(log[1].method).toBe("POST");
  });
});

describe("GmailClient.deleteLabel", () => {
  it("issues DELETE against the label id and drops it from the cache", async () => {
    withResponses(
      jsonResponse({ labels: [label("L1", "INBOX"), label("L2", "Augment/Tags/Travel")] }),
      noContentResponse(),
      jsonResponse(label("L3", "Augment/Tags/Travel")),
    );

    const client = newClient();
    await client.listLabels();
    await client.deleteLabel("L2");

    let log = calls();
    expect(log).toHaveLength(2);
    expect(log[1].url).toContain("/labels/L2");
    expect(log[1].method).toBe("DELETE");

    // After delete, a re-resolve for the same name should miss the cache and
    // POST to create a fresh label rather than hand back the deleted id.
    const id = await client.ensureLabelId("Augment/Tags/Travel");
    expect(id).toBe("L3");
    log = calls();
    expect(log).toHaveLength(3);
    expect(log[2].method).toBe("POST");
  });
});
