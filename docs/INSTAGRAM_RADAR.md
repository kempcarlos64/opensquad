# Instagram Radar

The Radar reads public Instagram data through the Apify Actors
`apify/instagram-search-scraper` and `apify/instagram-reel-scraper`.

Required server-only variables:

```env
APIFY_API_TOKEN=
APIFY_REAL_CALLS_ENABLED=false
APIFY_MAX_TOTAL_CHARGE_USD=0.10
```

Set the real-calls flag to `true` only after adding the token to the deployment
environment. The Top 10 is ranked only within the public Popular-search results
returned for the selected query; it is not a claim of the ten most viral Reels
on all of Instagram.

The link analyzer accepts only public `instagram.com/reel/...` and
`instagram.com/p/...` URLs. It does not automate login, CAPTCHA, 2FA or private
profiles. Public captions, transcripts and metrics are reduced to an abstract
format map before scripts are generated. The original media, speech, audio,
frames and brand identity are not copied or sent to HeyGen.
