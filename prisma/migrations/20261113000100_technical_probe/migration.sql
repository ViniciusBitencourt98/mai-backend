-- Technical PoC only; apply exclusively to an authorized development branch.
CREATE TABLE "technical_probes" (
    "id" UUID NOT NULL,
    "marker" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "technical_probes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "technical_probes_marker_key" ON "technical_probes"("marker");
