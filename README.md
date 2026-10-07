# Calorie tracker with a trackpad scale

A personal calorie and macro tracker that can weigh small portions of food on a MacBook's Force Touch trackpad.

## Features

- Daily food diary by meal, with calorie and macro totals against goals
- Food search across USDA FoodData Central and Open Food Facts, plus barcode lookup and custom foods
- Live trackpad weighing to fill in portion sizes
- Body-weight log and 30-day calorie chart

## Structure

```
calorie-tracker/
├── scale-helper/   Swift: reads trackpad pressure, serves the weight on http://localhost:8787
└── web/            Next.js app + local SQLite database (web/calories.db)
```

## Requirements

- macOS 15+ on a Mac with a Force Touch trackpad
- Swift 6.2+ (Xcode or Command Line Tools)
- Node.js 24+

## Running

```bash
# scale
cd scale-helper && swift run

# app
cd web && npm install && npm run dev   # http://localhost:3000
```

## Using the scale

1. Place a sheet of paper or a light container on the trackpad.
2. Rest one finger on the pad. The trackpad only reports pressure while it detects a finger.
3. Wait for the reading to show "stable" (it zeroes automatically), then add the food.
4. In the app, press **Use … g** to fill in the amount.

Calibration is under **Settings → Trackpad scale**.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `USDA_API_KEY` | `web/.env.local` | USDA FoodData Central key (defaults to the rate-limited `DEMO_KEY`) |
| `DB_PATH` | `web/.env.local` | Location of the SQLite database |
| `NEXT_PUBLIC_SCALE_URL` | `web/.env.local` | Scale helper URL (default `http://localhost:8787`) |

## Credits

Trackpad pressure is read via [OpenMultitouchSupport](https://github.com/Kyome22/OpenMultitouchSupport), which wraps Apple's private MultitouchSupport framework.
