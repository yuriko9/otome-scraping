import log4js from "log4js";
import puppeteer from "puppeteer";
import crypto from "crypto";
import fs from "fs";

// JSONファイル書き出し用パス
const JSON_PATH = "./star-json/star-data.json";
const JSON_SUB_PATH = "./star-json/star-url.json";
// 組一覧
const TROUPE = ["flower", "moon", "snow", "star", "cosmos", "special"];
// URL取得用
// const STAR_PATH = "div.slide05.clearfix ul:nth-child(2) li a"; // 専科対応で未使用
const STAR_PATH = "div.slide05.clearfix ul li a";
// プロフィール取得用
const PROFILE_PATH = "div.table01 td";
const IMG_PATH = "img[itemprop=photo]";
const NAMEJP_PATH = "h1[itemprop=name]";
const NAMEEN_PATH = "div.title07 div.inner small";
// Log4js
log4js.configure("log4js-config.json");
const systemLogger = log4js.getLogger("system");
const errorLoger = log4js.getLogger("error");

/**
 * 全組のスターのURLをオブジェクトの配列で返す
 */
const getAllUrl = async () => {
  systemLogger.info("url extraction has started.");
  const browser = await puppeteer.launch({
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();

  const allUrl = [];

  try {
    for (const troupe of TROUPE) {
      await page.goto(`https://kageki.hankyu.co.jp/star/${troupe}.html`);

      // href属性だけまとめて配列に
      const hrefs = await page.$$eval(STAR_PATH, (list) =>
        list.map((elm) => elm.href)
      );

      allUrl.push({
        troupe: troupe,
        url: hrefs,
      });
    }
  } catch (e) {
    errorLoger.error("Something happened in getAllUrl.");
    throw e;
  } finally {
    await browser.close();
  }

  systemLogger.info("url extraction is completed!");
  return allUrl;
};

/**
 * 全組のスターのProfileをオブジェクトの配列で返す
 */
const getStarData = async (starUrl) => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);

  const starDataAll = [];

  try {
    for (const data of starUrl) {
      systemLogger.info(`${data.troupe} data extraction is in progress...`);
      const troupeStars = [];
      let starTypeNum = 1; // トップかそうでないか
      if (data.troupe === "special") {
        starTypeNum = 3;
      }
      for (const url of data.url) {
        await page.goto(url);
        // td属性だけまとめて配列に
        const textContents = await page.$$eval(PROFILE_PATH, (list) =>
          list.map((elm) => elm.innerHTML)
        );
        // 急ごしらえの要素数合わせ（後々修正する）
        if (textContents.length === 5) {
          textContents.splice(4, 0, "");
        } else if (textContents.length < 5) {
          textContents.splice(4, 0, "", "");
        }
        // imgのsrc取得
        const _imgSrc = await page.$eval(IMG_PATH, (item) => item.src);
        // 漢字名取得
        const _nameJp = await page.$eval(NAMEJP_PATH, (item) => item.innerHTML);
        // 英語名取得
        const _nameEn = await page.$eval(NAMEEN_PATH, (item) => item.innerHTML);
        // 何期生か
        const _graduate = calcGraduate(textContents[3]);
        // uuid生成
        const _id = crypto.randomUUID();

        const star = {
          id: _id,
          troupe: data.troupe,
          starType: starTypeNum,
          nameJp: _nameJp,
          nameEn: _nameEn,
          firstStage: textContents[3],
          graduate: _graduate,
          birthday: textContents[0],
          birthPlace: textContents[1],
          height: textContents[2],
          favoriteRole: textContents[4],
          nickName: textContents[5],
          imgSrc: _imgSrc,
        };
        troupeStars.push(star);
        if (starTypeNum < 3) {
          starTypeNum++;
        }
      }
      const troupeData = {
        troupe: data.troupe,
        stars: troupeStars,
      };
      starDataAll.push(troupeData);
      systemLogger.info(`${data.troupe} data extraction is completed!`);
    }
  } catch (e) {
    errorLoger.error("Something happened in getStarData.");
    throw e;
  } finally {
    await browser.close();
  }
  return starDataAll;
};

/**
 * 初舞台から何期か計算する
 * param: 2010年4月「THE SCARLET PIMPERNEL」
 */
function calcGraduate(firstStage) {
  const firstYear = parseInt(firstStage.substr(0, 4));
  return firstYear - 1914;
}

(async () => {
  try {
    const allUrl = await getAllUrl();
    const starData = await getStarData(allUrl);
    // JSON書き出し
    fs.writeFileSync(JSON_SUB_PATH, JSON.stringify(allUrl, null, "  "));
    fs.writeFileSync(JSON_PATH, JSON.stringify(starData, null, "  "));
  } catch (e) {
    errorLoger.error(e);
  }
})();
