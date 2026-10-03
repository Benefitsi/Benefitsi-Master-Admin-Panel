# Benefits icon reference

Checked on 2026-10-03. The dashboard uses explicit, typed icon keys for every entry in its benefits category. Icons never depend on the wording of a title.

The product dimensions and names follow Notion [04 Deals & Naming](https://app.notion.com/p/39231e3e9b2b8138b1b3def60eee8d7e) and the [Surface Consistency Checklist](https://app.notion.com/p/39231e3e9b2b81b1ad36fc06c96e0b4e). These current pages define the taxonomy; they do not specify a separate SVG library.

The artwork reference is the consumer App's shared `benefitsiDealIconFor` resolver in `lib/components/benefitsi_ui/benefitsi_ui.dart`, plus the free-item override in `lib/components/partner_deal_badges/partner_deal_badges_widget.dart` (App checkout `d3cf347`). Some individual App screens use older, context-specific alternatives; those are not used as the dashboard reference.

| Benefit | Shared App icon |
| --- | --- |
| 2 für 1 | Rounded coupon/ticket (`confirmation_number`) |
| Rabatt | Rounded price tag (`local_offer`) |
| Gratisartikel | Original `assets/images/gift.svg` |
| Bonusstempel | Rounded ticket with star (`local_activity`) |
| Willkommen | Confetti (`celebration`) |
| Zeitbonus | Hourglass (`hourglass_bottom`; App alias `duration_bonus`) |
| Comeback | Return arrow (`replay`) |
| Happy Hour | Clock (`schedule`) |
| Dauerrabatt | Percent (`percent`) |
| Deal Drop | Lightning (`bolt`) |
| Geburtstag | Cake (`cake`) |
| Streak | Flame (`local_fire_department`) |
| Challenge | Trophy (`emoji_events`) |

The category tile and stamp-card rewards reuse the original gift artwork. The audience/rules entry uses the same rounded Material family (`groups`); it describes configuration, not a benefit type. The gift retains `RewardGiftIcon`'s 0.86 optical scale.

`lib/benefit-icons.ts` contains the original Material Icons Round SVG paths, their source URLs, and the App gift paths. `components/benefit-icon.tsx` renders those paths using the dashboard's current color, without loading an external font or icon service. Material artwork is by Google under [Apache-2.0](licenses/material-design-icons-LICENSE.txt). Shapes are unchanged; only the fill inherits the UI color, as it does in the App.

The `EcosystemEntry` type requires an icon key for every benefits entry, so new entries cannot silently fall back to a generic icon. Keep this mapping aligned with the shared App resolver when the product iconography changes.
