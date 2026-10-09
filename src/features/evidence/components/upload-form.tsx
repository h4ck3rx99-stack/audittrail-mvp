"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form-controls";
import { cn, formatBytes } from "@/lib/utils";
import { createLinkEvidenceAction } from "../actions";
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABELS } from "../schemas";

type Target = {
  id: string;
  code: string;
  name: string;
  evidenceRequirements: { id: string; title: string }[];
};
type Link = { controlId: string; evidenceRequirementId: string | null };

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type UploadResponse = {
  ok?: boolean;
  evidenceId?: string;
  error?: { message: string; fieldErrors?: Record<string, string[]> };
};

/** XHR upload so we can report progress. The route enforces the size cap and type checks. */
function uploadWithProgress(
  url: string,
  file: File,
  metadata: unknown,
  onProgress: (pct: number) => void,
): Promise<{ status: number; body: UploadResponse }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("x-evidence-metadata", toBase64Url(JSON.stringify(metadata)));
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: UploadResponse = {};
      try {
        body = JSON.parse(xhr.responseText) as UploadResponse;
      } catch {
        body = { error: { message: "Unexpected response from the server." } };
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

export function UploadEvidenceForm({
  orgSlug,
  targets,
  initialLink,
  maxMb,
  accept,
  today,
}: {
  orgSlug: string;
  targets: Target[];
  initialLink: Link | null;
  maxMb: number;
  accept: string;
  today: string;
}) {
  const router = useRouter();
  const [kind, setKind] = React.useState<"FILE" | "LINK">("FILE");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [links, setLinks] = React.useState<Link[]>(initialLink ? [initialLink] : []);
  const [pickControl, setPickControl] = React.useState("");
  const [pickRequirement, setPickRequirement] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const byId = new Map(targets.map((t) => [t.id, t]));

  const onFile = (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) {
      setErrors({ file: [`Files can be at most ${maxMb} MB.`] });
      return;
    }
    setErrors({});
    setFile(f);
  };

  const addLink = () => {
    if (!pickControl) return;
    const link = { controlId: pickControl, evidenceRequirementId: pickRequirement || null };
    if (
      !links.some(
        (l) =>
          l.controlId === link.controlId && l.evidenceRequirementId === link.evidenceRequirementId,
      )
    )
      setLinks([...links, link]);
    setPickRequirement("");
  };

  const submit = async (form: HTMLFormElement) => {
    setErrors({});
    setFormError(null);
    const fd = new FormData(form);
    const metadata = {
      title: String(fd.get("title") ?? ""),
      category: String(fd.get("category") ?? ""),
      description: String(fd.get("description") ?? ""),
      collectedAt: String(fd.get("collectedAt") ?? ""),
      validUntil: String(fd.get("validUntil") ?? ""),
      links,
    };
    setBusy(true);
    try {
      if (kind === "LINK") {
        const r = await createLinkEvidenceAction(orgSlug, {
          ...metadata,
          url: String(fd.get("url") ?? ""),
        });
        if (!r.ok) {
          setErrors(r.error.fieldErrors ?? {});
          setFormError(r.error.message);
          return;
        }
        toast.success("Evidence submitted for review");
        router.push(`/org/${orgSlug}/evidence/${r.data.evidenceId}`);
        return;
      }
      if (!file) {
        setErrors({ file: ["Choose a file to upload."] });
        return;
      }
      setProgress(0);
      const { status, body } = await uploadWithProgress(
        `/api/org/${orgSlug}/evidence/upload`,
        file,
        metadata,
        setProgress,
      );
      if (status >= 400 || !body.evidenceId) {
        setErrors(body.error?.fieldErrors ?? {});
        setFormError(body.error?.message ?? "Upload failed.");
        setProgress(null);
        return;
      }
      toast.success("Evidence uploaded and submitted for review");
      router.push(`/org/${orgSlug}/evidence/${body.evidenceId}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Upload failed.");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const selectedControl = pickControl ? byId.get(pickControl) : undefined;

  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
      noValidate
    >
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <div
          className="border-border flex gap-1 rounded-sm border p-0.5 text-[13px]"
          role="radiogroup"
          aria-label="Evidence type"
        >
          {(["FILE", "LINK"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "flex-1 rounded-sm px-3 py-1",
                kind === k
                  ? "bg-accent-subtle font-medium"
                  : "text-muted-foreground hover:bg-hover",
              )}
            >
              {k === "FILE" ? "File" : "Link"}
            </button>
          ))}
        </div>

        {kind === "FILE" ? (
          <div>
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a file or drop it here"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center",
                dragging ? "border-accent bg-accent-subtle" : "border-border-strong hover:bg-hover",
                errors.file && "border-danger",
              )}
            >
              <FileUp className="text-muted-foreground size-5" aria-hidden />
              {file ? (
                <p className="mt-2 text-[13px]">
                  <span className="font-medium">{file.name}</span> · {formatBytes(file.size)}
                </p>
              ) : (
                <p className="text-muted-foreground mt-2 text-[13px]">
                  Drop a file here or click to choose
                </p>
              )}
              <p className="text-faint-foreground mt-1 text-xs">
                PDF, PNG, JPG, WebP, DOCX, XLSX, PPTX, CSV, TXT, JSON, MD or LOG · up to {maxMb} MB
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept={accept}
              onChange={(e) => onFile(e.target.files?.[0])}
              aria-label="File"
            />
            {errors.file ? (
              <p className="text-danger mt-1 text-xs" role="alert">
                {errors.file.join(" ")}
              </p>
            ) : null}
            {progress !== null ? (
              <div className="mt-2">
                <div
                  className="bg-hover h-1.5 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                >
                  <div className="bg-accent h-full" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-muted-foreground mt-1 text-xs tabular-nums">{progress}%</p>
              </div>
            ) : null}
          </div>
        ) : (
          <Field
            label="URL"
            htmlFor="url"
            errors={errors.url}
            hint="http:// or https:// only, e.g. a link to a report in your ticketing system."
          >
            <Input name="url" type="url" placeholder="https://" maxLength={2048} />
          </Field>
        )}

        <Field label="Title" htmlFor="title" errors={errors.title}>
          <Input
            name="title"
            maxLength={200}
            defaultValue={file ? file.name.replace(/\.[^.]+$/, "") : undefined}
            key={file?.name ?? "title"}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="category" errors={errors.category}>
            <Select name="category" defaultValue="OTHER">
              {EVIDENCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EVIDENCE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Collected on" htmlFor="collectedAt" errors={errors.collectedAt}>
            <Input name="collectedAt" type="date" defaultValue={today} max={today} />
          </Field>
        </div>
        <Field
          label="Valid until"
          htmlFor="validUntil"
          errors={errors.validUntil}
          optional
          hint="Leave empty to use the requirement's freshness period when approved."
        >
          <Input name="validUntil" type="date" />
        </Field>
        <Field label="Description" htmlFor="description" errors={errors.description} optional>
          <Textarea name="description" maxLength={4000} />
        </Field>
        <Button type="submit" variant="primary" disabled={busy} className="self-start">
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? (kind === "FILE" ? "Uploading…" : "Saving…") : "Submit for review"}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium">Supports</p>
        <p className="text-muted-foreground -mt-2 text-xs">
          Link this evidence to the controls and requirements it proves. You can add more links
          later.
        </p>
        {links.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-sm border border-dashed px-3 py-3 text-[13px]">
            Not linked yet.
          </p>
        ) : (
          <ul className="border-border rounded-md border">
            {links.map((l) => {
              const c = byId.get(l.controlId);
              const r = c?.evidenceRequirements.find((x) => x.id === l.evidenceRequirementId);
              return (
                <li
                  key={`${l.controlId}:${l.evidenceRequirementId}`}
                  className="border-border flex items-center gap-2 border-b px-3 py-2 text-[13px] last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="mono text-muted-foreground mr-1.5">{c?.code}</span>
                    {r ? r.title : "Control (no specific requirement)"}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove link"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setLinks(links.filter((x) => x !== l))}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-border flex flex-col gap-2 rounded-md border p-3">
          <Select
            value={pickControl}
            onChange={(e) => {
              setPickControl(e.target.value);
              setPickRequirement("");
            }}
            aria-label="Control"
          >
            <option value="">Choose a control…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} · {t.name}
              </option>
            ))}
          </Select>
          {selectedControl ? (
            <Select
              value={pickRequirement}
              onChange={(e) => setPickRequirement(e.target.value)}
              aria-label="Evidence requirement"
            >
              <option value="">No specific requirement</option>
              {selectedControl.evidenceRequirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </Select>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={addLink}
            disabled={!pickControl}
            className="self-start"
          >
            Add link
          </Button>
        </div>
      </div>
    </form>
  );
}

export function NewVersionForm({
  orgSlug,
  evidenceId,
  maxMb,
  accept,
  today,
}: {
  orgSlug: string;
  evidenceId: string;
  maxMb: number;
  accept: string;
  today: string;
}) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [collectedAt, setCollectedAt] = React.useState(today);
  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <Field
        label="File"
        htmlFor="version-file"
        hint={`Up to ${maxMb} MB. The evidence returns to pending review.`}
      >
        <Input type="file" accept={accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <Field label="Collected on" htmlFor="version-collected">
        <Input
          type="date"
          value={collectedAt}
          max={today}
          onChange={(e) => setCollectedAt(e.target.value)}
        />
      </Field>
      {progress !== null ? (
        <div
          className="bg-hover h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
        >
          <div className="bg-accent h-full" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <Button
        variant="primary"
        disabled={!file || busy}
        className="self-start"
        onClick={async () => {
          if (!file) return;
          setBusy(true);
          setError(null);
          setProgress(0);
          try {
            const { status, body } = await uploadWithProgress(
              `/api/org/${orgSlug}/evidence/upload`,
              file,
              { evidenceId, collectedAt },
              setProgress,
            );
            if (status >= 400) {
              setError(body.error?.message ?? "Upload failed.");
              setProgress(null);
              return;
            }
            toast.success("New version uploaded and submitted for review");
            router.refresh();
            setFile(null);
            setProgress(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed.");
            setProgress(null);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Upload new version
      </Button>
    </div>
  );
}
