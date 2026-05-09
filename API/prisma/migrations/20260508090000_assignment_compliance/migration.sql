-- CreateEnum
CREATE TYPE "AdCategory" AS ENUM (
    'HOME_HELP',
    'GARDENING',
    'TUTORING',
    'IT_SUPPORT',
    'BEAUTY_WELLNESS',
    'EVENTS',
    'MOVING_DELIVERY',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "PriceMode" AS ENUM ('FREE', 'HOURLY', 'FIXED');

-- CreateEnum
CREATE TYPE "ServiceTerm" AS ENUM ('REMOTE', 'AT_PROVIDER', 'AT_CUSTOMER');

-- UpdateEnum
ALTER TYPE "AdStatus" RENAME TO "AdStatus_old";

CREATE TYPE "AdStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Ad"
    ADD COLUMN "category_new" "AdCategory" NOT NULL DEFAULT 'OTHER',
    ADD COLUMN "priceMode" "PriceMode" NOT NULL DEFAULT 'FREE',
    ADD COLUMN "priceValue" DECIMAL(10,2),
    ADD COLUMN "serviceTerms" "ServiceTerm"[] NOT NULL DEFAULT ARRAY[]::"ServiceTerm"[];

UPDATE "Ad"
SET
    "category_new" = CASE UPPER(TRIM("category"))
        WHEN 'BRICOLAGE' THEN 'HOME_HELP'::"AdCategory"
        WHEN 'AIDE A DOMICILE' THEN 'HOME_HELP'::"AdCategory"
        WHEN 'JARDINAGE' THEN 'GARDENING'::"AdCategory"
        WHEN 'COURS' THEN 'TUTORING'::"AdCategory"
        WHEN 'INFORMATIQUE' THEN 'IT_SUPPORT'::"AdCategory"
        WHEN 'BEAUTE' THEN 'BEAUTY_WELLNESS'::"AdCategory"
        WHEN 'EVENEMENTIEL' THEN 'EVENTS'::"AdCategory"
        WHEN 'LIVRAISON' THEN 'MOVING_DELIVERY'::"AdCategory"
        ELSE 'OTHER'::"AdCategory"
    END,
    "priceMode" = CASE
        WHEN "price" IS NULL THEN 'FREE'::"PriceMode"
        ELSE 'FIXED'::"PriceMode"
    END,
    "priceValue" = "price",
    "serviceTerms" = CASE UPPER(COALESCE(TRIM("terms"), ''))
        WHEN 'REMOTE' THEN ARRAY['REMOTE']::"ServiceTerm"[]
        WHEN 'AT_PROVIDER' THEN ARRAY['AT_PROVIDER']::"ServiceTerm"[]
        WHEN 'AT_CUSTOMER' THEN ARRAY['AT_CUSTOMER']::"ServiceTerm"[]
        ELSE ARRAY[]::"ServiceTerm"[]
    END;

ALTER TABLE "Ad"
    ALTER COLUMN "status" DROP DEFAULT,
    ALTER COLUMN "status" TYPE "AdStatus"
    USING (
        CASE
            WHEN "status"::text = 'PUBLISHED' THEN 'PUBLISHED'::"AdStatus"
            ELSE 'DRAFT'::"AdStatus"
        END
    );

ALTER TABLE "Ad"
    ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "Ad"
    DROP COLUMN "category",
    DROP COLUMN "price",
    DROP COLUMN "terms";

ALTER TABLE "Ad" RENAME COLUMN "category_new" TO "category";

DROP TYPE "AdStatus_old";