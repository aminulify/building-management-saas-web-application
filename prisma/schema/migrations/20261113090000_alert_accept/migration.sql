-- The reporter of an emergency alert confirms that the solution is fine ("Accept & Close Issue")
ALTER TABLE "EmergencyAlert" ADD COLUMN "acceptedAt" TIMESTAMPTZ;
