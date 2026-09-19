# 初回提出の公式資料（Goal015）

確認日：**2026-09-19**。以下はApple／Expoの公式ページを実際に開いて確認したもの。提出を実行する日にも再確認する。外部アカウント、名称予約、申告、アップロードは操作していない。

| ID | 公式資料 | 今回の適用 |
| --- | --- | --- |
| S1 | [Expo app config](https://docs.expo.dev/versions/latest/config/app/) | `name`は表示名。Bundle ID等の技術識別と分離する。日本語の生成設定を確認し、最終IPAの表示名・ローカライズ・アイコンも検査する。 |
| S2 | [Apple App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/) | 名前・副題は各30文字以内。App Store上の名前、Bundle ID、自動付与される数値Apple IDは別。ローカル改名はストア名の使用可能・権利確認を意味しない。 |
| S3 | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | §1.5の到達可能な連絡先、§2.1の完成した提出物、§2.3の正確な商品説明、§5.1.1(i)のプライバシー説明を確認。未公開URLや仮文言を残したまま提出可能とはしない。 |
| S4 | [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/) | ポリシーURLとアプリ・組み込み第三者コードの実際の取扱いに基づく申告が必要。[監査](privacy-support-audit.md)を参照。 |
| S5 | [Expo build profiles](https://docs.expo.dev/build/eas-json/) | development／internal previewとストア向けproductionを区別。previewのIPAを改名して提出しない。 |
| S6 | [Expo Submit for iOS](https://docs.expo.dev/submit/ios/) | `submit.production.ios.ascAppId`は実在するASCレコードの数値Apple ID。アップロード処理後のTestFlightと、本番App Reviewへの提出は別工程。 |
| S7 | [Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/) | 2026-04-28以降はXcode 26以降・iOS 26 SDK以降でのビルドが最低要件。実際のEASログで確認する。Expo SDK番号、端末の最低対応iOSとは別の値。 |
| S8 | [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) | 現行質問票の内容・頻度への回答から各地域のレーティングが決まる。標準の怖さの追跡・接触・恐怖演出も確認し、控えめ設定だけで低く申告しない。未回答の年齢区分を決め打ちしない。 |
| S9 | [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) | 1〜10枚、JPEG／PNG。iPhone 6.9枠の縦1320×2868等を使用できる。6.9枠を提供しない場合に6.5枠が必要。[撮影計画](screenshot-plan.md)に実寸と候補端末を記載。 |
| S10 | [EAS CLI reference](https://docs.expo.dev/eas/cli/) | `submit --profile production --id`で今回の特定ビルドを指定。`--latest`による取り違えを避ける。 |
| S11 | [Submit an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/) | バージョンと正しいビルドを結び付け、Add for Review、その後Submit for Review。前者だけでは審査に送信されない。 |
| S12 | [Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/) | アップロード先のレコードが必要。まず既存の同じBundle IDを確認。存在しない場合だけ所有者が登録する。名前、日本語の主言語、Bundle ID、SKU等を確認する。 |

フィールドの追加根拠：[Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)。説明4,000文字、プロモーション170文字、キーワード100バイト、Review Notes4,000バイト。初版には「このバージョンの最新情報」欄がない。公開連絡先と非公開の審査連絡先を分ける。

地域は所有者が選ぶ。選んだ地域について、ASCの[EU事業者要件](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)、[中国本土の要件](https://developer.apple.com/help/app-store-connect/manage-compliance-information/view-china-mainland-compliance-information/)、[韓国の要件](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-korea-compliance-information/)等の適用を提出時に確認する。日本語UIであることは、地域ごとの申告の代わりにならない。これらの地域を配信対象として決定した記録ではない。
