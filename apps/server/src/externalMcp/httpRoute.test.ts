import http from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Exit, Layer, Scope, Stream } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { ServerAuth } from "../auth/Services/ServerAuth.ts";
import { ServerConfig } from "../config.ts";
import { ExternalMcpGateway } from "./Services/ExternalMcpGateway.ts";
import { ExternalMcpService } from "./Services/ExternalMcpService.ts";
import {
  externalMcpRouteLayer,
  readExternalMcpBody,
  readExternalMcpManagementBody,
} from "./httpRoute.ts";

const EXTERNAL_TOKEN = "syn_mcp_v1_external-route-test";
const OTHER_EXTERNAL_TOKEN = `${EXTERNAL_TOKEN}-other`;

async function withExternalMcpServer(
  input: {
    readonly host?: string;
    readonly publicUrl?: URL;
    readonly verifyCredentialFailure?: {
      readonly code: string;
      readonly message: string;
      readonly status: 401 | 500;
    };
    readonly handleVerifiedPost?: (
      body: unknown,
    ) => Effect.Effect<{ readonly status: number; readonly body?: unknown }>;
  },
  run: (input: {
    readonly origin: string;
    readonly handledBodies: ReadonlyArray<unknown>;
  }) => Promise<void>,
): Promise<void> {
  const scope = await Effect.runPromise(Scope.make("sequential"));
  const handledBodies: unknown[] = [];
  let nodeServer: http.Server | null = null;
  try {
    const verified = (integrationId: string) =>
      ({
        integration: {
          integrationId,
          name: "Route test",
          audience: "synara.external-mcp",
          credentialHash: "hash-only",
          capabilities: ["projects:read"],
          projectIds: ["project-route-test"],
          createdAt: "2026-07-20T00:00:00.000Z",
          expiresAt: "2026-08-20T00:00:00.000Z",
          lastUsedAt: null,
          pairedAt: "2026-07-20T00:00:00.000Z",
          revokedAt: null,
          rateLimitPerMinute: 60,
          concurrencyLimit: 2,
        },
        capabilities: new Set(["projects:read"]),
        allowedProjectIds: new Set(["project-route-test"]),
      }) as never;
    const service = {
      verifyCredential: (credential: string) =>
        input.verifyCredentialFailure
          ? Effect.fail(input.verifyCredentialFailure)
          : credential === EXTERNAL_TOKEN || credential === OTHER_EXTERNAL_TOKEN
            ? Effect.succeed(
                verified(
                  credential === EXTERNAL_TOKEN
                    ? "integration-route-test"
                    : "integration-route-test-other",
                ),
              )
            : Effect.fail({ code: "external_credential_invalid", message: "invalid", status: 401 }),
      listIntegrations: () => Effect.succeed([]),
      createIntegration: () => Effect.die("not used"),
      revokeIntegration: () => Effect.succeed(false),
      pair: () => Effect.die("not used"),
      assertActive: () => Effect.succeed(verified),
      assertProject: () => Effect.void,
      assertTaskRead: () => Effect.void,
      beginAudit: () => Effect.succeed("audit-route-test"),
      finishAudit: () => Effect.void,
    } as never;
    const gateway = {
      handlePost: (request: { readonly body: unknown }) => {
        handledBodies.push(request.body);
        return Effect.succeed({ status: 200, body: { ok: true } });
      },
      handleVerifiedPost: (request: { readonly body: unknown }) => {
        return Effect.suspend(() => {
          handledBodies.push(request.body);
          return input.handleVerifiedPost
            ? input.handleVerifiedPost(request.body)
            : Effect.succeed({ status: 200, body: { ok: true } });
        });
      },
    } as never;
    const auth = {
      authenticateHttpRequest: () =>
        Effect.succeed({
          sessionId: "owner-session",
          subject: "owner",
          method: "bootstrap",
          role: "owner",
          credentialSource: "cookie",
        }),
    } as never;

    await Effect.runPromise(
      Scope.provide(
        Effect.gen(function* () {
          const httpServer = yield* NodeHttpServer.make(
            () => {
              nodeServer = http.createServer();
              return nodeServer;
            },
            { port: 0, host: "127.0.0.1" },
          );
          const httpApp = yield* HttpRouter.toHttpEffect(externalMcpRouteLayer);
          yield* httpServer.serve(httpApp);
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(ExternalMcpService, service),
              Layer.succeed(ExternalMcpGateway, gateway),
              Layer.succeed(ServerAuth, auth),
              Layer.succeed(ServerConfig, {
                host: input.host ?? "127.0.0.1",
                publicUrl: input.publicUrl,
              } as never),
              NodeServices.layer,
            ),
          ),
        ),
        scope,
      ),
    );

    const address = (nodeServer as http.Server | null)?.address();
    if (!address || typeof address !== "object") throw new Error("Missing test server address");
    await run({ origin: `http://127.0.0.1:${address.port}`, handledBodies });
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
}

describe("externalMcpRouteLayer", () => {
  it("returns 410 for External MCP product routes after ADE surface removal", async () => {
    await withExternalMcpServer({}, async ({ origin, handledBodies }) => {
      const mcpPost = await fetch(`${origin}/mcp/external`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${EXTERNAL_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });
      expect(mcpPost.status).toBe(410);
      expect(await mcpPost.text()).toContain("removed");

      const list = await fetch(`${origin}/api/mcp/external/integrations`);
      expect(list.status).toBe(410);

      const revoke = await fetch(`${origin}/api/mcp/external/integrations/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ integrationId: "integration-route-test" }),
      });
      expect(revoke.status).toBe(410);
      expect(handledBodies).toHaveLength(0);
    });
  });

  it("times out stalled body streams and releases their permits", async () => {
    const stalledRequest = {
      headers: {},
      stream: Stream.never,
    } as never;
    const stalled = await Effect.runPromise(
      Effect.all(
        Array.from({ length: 4 }, () => readExternalMcpBody(stalledRequest, 10)),
        { concurrency: "unbounded" },
      ),
    );
    expect(stalled).toEqual(Array.from({ length: 4 }, () => ({ kind: "timeout" })));

    const validRequest = {
      headers: {},
      stream: Stream.make(new TextEncoder().encode('{"ok":true}')),
    } as never;
    await expect(Effect.runPromise(readExternalMcpBody(validRequest, 100))).resolves.toEqual({
      kind: "ok",
      body: { ok: true },
    });
  });

  it("bounds time spent queued behind occupied body-buffer permits", async () => {
    let startedReads = 0;
    const holdingRequest = {
      headers: {},
      stream: Stream.concat(
        Stream.fromEffect(
          Effect.sync(() => {
            startedReads += 1;
            return new Uint8Array();
          }),
        ),
        Stream.never,
      ),
    } as never;
    const holders = Array.from({ length: 4 }, () =>
      Effect.runPromise(readExternalMcpBody(holdingRequest, 200)),
    );
    const deadline = Date.now() + 1_000;
    while (startedReads < 4 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(startedReads).toBe(4);

    let queuedStarted = false;
    const queuedRequest = {
      headers: {},
      stream: Stream.concat(
        Stream.fromEffect(
          Effect.sync(() => {
            queuedStarted = true;
            return new Uint8Array();
          }),
        ),
        Stream.never,
      ),
    } as never;
    const queued = await Effect.runPromise(readExternalMcpBody(queuedRequest, 10));
    expect(queued).toEqual({ kind: "timeout" });
    expect(queuedStarted).toBe(false);
    await Promise.all(holders);
    expect(queuedStarted).toBe(false);
  });

  it("times out management bodies while queued or stalled and releases shared permits", async () => {
    const stalledRequest = {
      headers: {},
      stream: Stream.never,
    } as never;
    const stalled = await Effect.runPromise(
      Effect.all(
        Array.from({ length: 4 }, () => readExternalMcpManagementBody(stalledRequest, 10)),
        { concurrency: "unbounded" },
      ),
    );
    expect(stalled).toEqual(Array.from({ length: 4 }, () => ({ kind: "timeout" })));

    const validRequest = {
      headers: {},
      stream: Stream.make(new TextEncoder().encode('{"nonce":"abcdefghijklmnopqrstuvwxyz"}')),
    } as never;
    await expect(
      Effect.runPromise(readExternalMcpManagementBody(validRequest, 100)),
    ).resolves.toEqual({
      kind: "ok",
      body: { nonce: "abcdefghijklmnopqrstuvwxyz" },
    });
  });

  it("isolates authenticated external body reads from stalled management traffic", async () => {
    const stalledRequest = {
      headers: {},
      stream: Stream.never,
    } as never;
    const stalledManagementReads = Array.from({ length: 2 }, () =>
      Effect.runPromise(readExternalMcpManagementBody(stalledRequest, 100)),
    );

    const validExternalRequest = {
      headers: {},
      stream: Stream.make(new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"ping"}')),
    } as never;
    await expect(Effect.runPromise(readExternalMcpBody(validExternalRequest, 50))).resolves.toEqual(
      {
        kind: "ok",
        body: { jsonrpc: "2.0", id: 1, method: "ping" },
      },
    );
    await Promise.all(stalledManagementReads);
  });

});
