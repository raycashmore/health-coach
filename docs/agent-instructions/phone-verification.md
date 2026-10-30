# Phone verification

Use when checking an Android change on the owner's phone, or when the owner asks for a review of "the app". That means the
running app, not the Pencil design.

## Run the app

1. Check the device: `adb devices -l`. The phone usually connects over wireless debugging.
2. Start or reuse the stack: `pnpm dev:phone`, run in the background. Metro reloads the app as files change.
3. Before looking at the phone, confirm `.scratch/dev-phone/typecheck.log` says `Found 0 errors`. Metro strips types
   without checking them, so a type error shows up only as a render error on the device.
4. If the change does not appear, read `.scratch/dev-phone/metro.log` before debugging the code.

A cold start signs the owner out, because the mobile session is not persisted. The sign-in form is prefilled from the
local owner account.

## Look at the screen

- **Privacy:** screens show the owner's real health data. Save captures under `/tmp`, never in the repo, and never
  copy values into commits, docs or tracker comments.
- **Text, bounds and layout:** run `adb shell uiautomator dump /sdcard/ui.xml`, then `adb shell cat /sdcard/ui.xml`
  and `grep`. This is cheaper than a screenshot, and it gives exact element bounds.
- **Appearance:** run `adb exec-out screencap -p > /tmp/<name>.png`, then shrink it with `sips -Z 1000` before
  reading. The phone is 1440×3120 pixels.
- **Driving the app:** use `adb shell input tap X Y`, `input swipe`, `input text` (with `%s` for spaces) and
  `input keyevent KEYCODE_BACK`. Coordinates are in device pixels. A locked phone shows a black capture; ask the owner
  to unlock it.
- **Debug output:** `console.log` does not reach logcat in React Native 0.86. Render a temporary `<Text>` instead,
  and remove it afterwards.
