# Calorie tracker with a trackpad scale

A personal MyFitnessPal-style app. You can weigh small portions of food on your MacBook's Force Touch trackpad.

```
calorie-tracker/
├── scale-helper/   Swift: reads trackpad pressure, serves the weight on http://localhost:8787 (this Mac only)
└── web/            Next.js app + local SQLite database (web/calories.db)
```

## Run it

```bash
# terminal 1: the scale (only needed when you want to weigh food)
cd scale-helper && swift run

# terminal 2: the app
cd web && npm run dev        # open http://localhost:3000
```

## Weighing food

1. Put a piece of paper or a light bowl on the trackpad. Never put food directly on the glass, and nothing wet or hot.
2. Rest one finger lightly on the pad and keep it there. The trackpad only reports pressure while it feels a finger.
3. Wait for "stable", which means it has zeroed itself. Then add food.
4. In the app, press **Use … g**.

Keep it to small amounts. It's a trackpad, not a kitchen scale. To calibrate, go to **Settings → Trackpad scale** and weigh something you know the weight of.

## Food data

- **USDA FoodData Central**: basic foods. It uses the shared `DEMO_KEY` by default, which is rate-limited.
  You can get a free key at https://fdc.nal.usda.gov/api-key-signup and put it in `web/.env.local` as `USDA_API_KEY=...`.
- **Open Food Facts**: branded products and barcode lookup. To look up a barcode, type its digits into the search box.

## Notes

- The scale uses Apple's private MultitouchSupport framework, through OpenMultitouchSupport.
  A macOS update could break it.
- There is no login. Don't expose the web app to the internet.
