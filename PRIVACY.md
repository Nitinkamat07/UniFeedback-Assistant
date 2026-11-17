# Privacy

UniFeedback Assistant v1.2.1 is designed to run locally in the browser.

- The extension declares the Chrome permissions `activeTab`, `scripting`, and `storage`.
- It scans the active page only after the user opens the extension and chooses **Scan this page**.
- It reads supported dropdown and radio-button questions so the user can review them.
- It stores only the last selected fill mode and the “only fill unanswered questions” preference in `chrome.storage.local`.
- It applies selected ratings only after the user clicks **Apply selected ratings**.
- It does not click Finish or submit the feedback form.
- The extension source contains no external service integration or account sign-in flow.

Feedback answers are handled in the active page by the browser extension. The extension does not provide a server-side account or sync service.
