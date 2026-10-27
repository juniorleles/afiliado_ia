import { existsSync } from "node:fs";
import { sha256File } from "@/lib/presell-quality/fingerprint";
import { bindScreenshotsToGeneration, screenshotAssociationError } from "@/lib/presell-quality/normalize";
import type { PresellScreenshotRef } from "@/lib/presell-quality/input";

export type ScreenshotBinding = {
  ok: boolean;
  code: string | null;
  message: string;
  generationId: string;
  desktopHash: string | null;
  mobileHash: string | null;
};

export function validateScreenshotBinding(input: {
  generationId: string;
  desktop: PresellScreenshotRef | null;
  mobile: PresellScreenshotRef | null;
  checkFiles?: boolean;
}): ScreenshotBinding {
  const bind = screenshotAssociationError(input);
  if (bind) {
    return {
      ok: false,
      code: bind.code,
      message: bind.message,
      generationId: input.generationId,
      desktopHash: input.desktop?.sha256 ?? null,
      mobileHash: input.mobile?.sha256 ?? null,
    };
  }
  if (input.checkFiles !== false) {
    if (!existsSync(input.desktop!.path) || !existsSync(input.mobile!.path)) {
      return {
        ok: false,
        code: "SCREENSHOT_MISSING",
        message: "Captured screenshot files are missing.",
        generationId: input.generationId,
        desktopHash: input.desktop!.sha256,
        mobileHash: input.mobile!.sha256,
      };
    }
    const desktopHash = sha256File(input.desktop!.path);
    const mobileHash = sha256File(input.mobile!.path);
    if (desktopHash !== input.desktop!.sha256 || mobileHash !== input.mobile!.sha256) {
      return {
        ok: false,
        code: "SCREENSHOT_HASH_MISMATCH",
        message: "Screenshot files do not match the recorded hashes.",
        generationId: input.generationId,
        desktopHash,
        mobileHash,
      };
    }
  }
  return {
    ok: true,
    code: null,
    message: "Screenshots are bound to this generation.",
    generationId: input.generationId,
    desktopHash: input.desktop!.sha256,
    mobileHash: input.mobile!.sha256,
  };
}

export function boundScreenshotsForImmutableFixture(
  shots: { desktop: PresellScreenshotRef | null; mobile: PresellScreenshotRef | null },
  generationId: string,
): { desktop: PresellScreenshotRef | null; mobile: PresellScreenshotRef | null } {
  return bindScreenshotsToGeneration(shots, generationId);
}
