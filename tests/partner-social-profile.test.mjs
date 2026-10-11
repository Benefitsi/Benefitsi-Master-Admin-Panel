import assert from "node:assert/strict"
import test from "node:test"
import { parsePartnerSocialProfile } from "../lib/partner-social-profile.ts"

test("all five social handles produce the corresponding platform profile", () => {
  for (const [platform, url] of [["facebook", "https://www.facebook.com/benefitsi"], ["instagram", "https://www.instagram.com/benefitsi"], ["tiktok", "https://www.tiktok.com/@benefitsi"], ["x", "https://x.com/benefitsi"], ["youtube", "https://www.youtube.com/@benefitsi"]]) {
    assert.deepEqual(parsePartnerSocialProfile(platform, " @benefitsi "), { handle: "benefitsi", url })
  }
})

test("complete Facebook, YouTube and legacy platform URLs retain their paths and query IDs", () => {
  for (const [platform, input, handle] of [["facebook", "https://www.facebook.com/profile.php?id=12345", "12345"], ["facebook", "https://www.facebook.com/people/Test-Cafe/12345/", "people"], ["youtube", "https://www.youtube.com/channel/UC-test", "UC-test"], ["youtube", "https://www.youtube.com/c/TestCafe", "TestCafe"], ["youtube", "https://www.youtube.com/user/TestCafe", "TestCafe"], ["x", "https://twitter.com/benefitsi", "benefitsi"]]) {
    assert.deepEqual(parsePartnerSocialProfile(platform, input), { handle, url: input })
  }
  assert.equal(parsePartnerSocialProfile("instagram", "instagram.com/benefitsi").url, "https://instagram.com/benefitsi")
})

test("invalid handles, unsafe URLs and URLs for a different selected platform are rejected", () => {
  for (const value of ["", "@", "a b", "javascript:alert(1)", "https://example.com/a", "https://instagram.com.evil.test/a", "https://user:pass@instagram.com/a", "https://instagram.com:8080/a", "https://www.youtube.com/@benefitsi", "https://instagram.com/"]) {
    assert.equal(parsePartnerSocialProfile("instagram", value), null, value)
  }
})
