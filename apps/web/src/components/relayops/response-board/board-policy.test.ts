import { describe, expect, it } from "vitest";
import {
  adjacentResponseBoardStatus,
  defaultResolveResponseBoardConflict,
  isLifecycleTransitionAllowed,
  isReversibleLifecycleTransition,
  responseBoardKeyboardCoordinates,
  responseBoardLaneId,
} from "./board-policy";
import { responseBoardLaneStatuses } from "./types";

describe("response board policy", () => {
  it("keeps canonical lifecycle lanes fixed and advances keyboard targets in order", () => {
    expect(responseBoardLaneStatuses).toEqual([
      "detected",
      "triaging",
      "mitigating",
      "monitoring",
      "resolved",
      "dismissed",
    ]);
    const triaging = adjacentResponseBoardStatus("detected", "next");
    expect(triaging).toBe("triaging");
    expect(adjacentResponseBoardStatus(triaging as "triaging", "next")).toBe(
      "mitigating",
    );
  });

  it("distinguishes allowed, invalid, and explicitly reversible transitions", () => {
    expect(isLifecycleTransitionAllowed("detected", "triaging")).toBe(true);
    expect(isLifecycleTransitionAllowed("detected", "resolved")).toBe(false);
    expect(isReversibleLifecycleTransition("mitigating", "monitoring")).toBe(
      true,
    );
    expect(isReversibleLifecycleTransition("detected", "triaging")).toBe(false);
  });

  it("moves KeyboardSensor coordinates to the adjacent canonical lane", () => {
    const targetRect = {
      left: 320,
      top: 20,
      width: 280,
      height: 500,
    };
    const coordinates = responseBoardKeyboardCoordinates(
      new KeyboardEvent("keydown", { code: "ArrowRight" }),
      {
        active: "incident-1",
        currentCoordinates: { x: 10, y: 10 },
        context: {
          active: { data: { current: { status: "detected" } } },
          collisionRect: {
            left: 20,
            top: 30,
            width: 260,
            height: 120,
          },
          droppableRects: new Map([
            [responseBoardLaneId("triaging"), targetRect],
          ]),
        },
      } as unknown as Parameters<typeof responseBoardKeyboardCoordinates>[1],
    );

    expect(coordinates).toEqual({ x: 320, y: 190 });
  });

  it("extracts only structured version conflicts", () => {
    expect(
      defaultResolveResponseBoardConflict({
        body: {
          code: "version_conflict",
          current: { incident: { status: "triaging", version: 4 } },
        },
      }),
    ).toEqual({ status: "triaging", version: 4 });
    expect(
      defaultResolveResponseBoardConflict({
        body: {
          code: "forbidden",
          current: { status: "triaging", version: 4 },
        },
      }),
    ).toBeNull();
  });
});
