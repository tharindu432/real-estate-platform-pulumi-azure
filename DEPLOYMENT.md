How I Would Mitigate This

STEP 1 : REDUCE TTL WELL IN ADVANCE ---> LOWER THE TTL TO 300 SECONDS. THIS MEANS ONCE WE FLIP THE DNS RECORD , THE PROPOGATION WINDOW IS ONLY 5 MINUTES RATHER THAN 24 HOURS


STEP 2 : PRE LAUNCH VALIDATION --> BEFORE TOUCHING DNS, VERIFY THE NEW PLATFORM END TO END USING A TEMPORARY URL . PURPOSE IS NOT TO CUTOVER DNS UNTILE EVERY CHECK PASSES

STEP 3 : Switch traffic in order — static assets first, then API, then frontend ---> Don't flip everything at once. Switch the CDN/static assets first (lowest risk),
then the API, then the main frontend domain. 

STEP 4 : Keep the old platform running for at least 24 hours after cutover --> Do not tear down the old SaaS platform immediately. During the propagation window,
some users are still hitting it. Keep it alive and monitor both platforms.

