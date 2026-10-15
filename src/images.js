'use strict';

// Archival photographs, selected for the period rather than the current article.
// Dates, authors and rights statements checked against Commons on 2026-10-15.
// Keep each source link with the image; do not replace with uncredited reuploads.
const HISTORICAL_IMAGES = {
  1: {
    title:'五四运动中的北京学生', date:'1919年5月4日', year:1919,
    caption:'北京学生在天安门前集会。这张照片为理解五四运动与新文化运动提供时代背景。',
    alt:'1919年五四运动中聚集在天安门前的学生，黑白历史照片',
    src:'https://upload.wikimedia.org/wikipedia/commons/0/00/Chinese_protestors_march_against_the_Treaty_of_Versailles_%28May_4%2C_1919%29.jpg',
    width:1300, height:783,
    sourceUrl:'https://commons.wikimedia.org/wiki/File:Chinese_protestors_march_against_the_Treaty_of_Versailles_(May_4,_1919).jpg',
    credit:'摄影者不详；Commons 收录，来源为香港中央图书馆五四百年图片展',
    rights:'公有领域（Commons 标注 PD-China）'
  },
  2: {
    title:'孙中山出席黄埔军校开学典礼', date:'1924年6月16日', year:1924,
    caption:'黄埔军校开学典礼上的孙中山。可结合第一次国共合作、军校建设与北伐的背景阅读。',
    alt:'孙中山出席黄埔军校开学典礼的黑白照片',
    src:'https://upload.wikimedia.org/wikipedia/commons/c/c0/Sun_Yat-sen_in_Whampoa_Military_Academy_open_ceremony.jpg',
    width:960, height:676,
    sourceUrl:'https://commons.wikimedia.org/wiki/File:Sun_Yat-sen_in_Whampoa_Military_Academy_open_ceremony.jpg',
    credit:'摄影者不详；Wikimedia Commons 收录',
    rights:'公有领域（Commons 标注 PD-China）'
  },
  3: {
    title:'斯诺在陕北采访', date:'1936年8月', year:1936,
    caption:'徐特立、埃德加·斯诺与黄华。Commons 中文说明将采访地点记为保安（今志丹），照片呈现长征后陕北根据地的对外交流。',
    alt:'1936年徐特立、埃德加·斯诺和黄华在陕北的黑白合影',
    src:'https://upload.wikimedia.org/wikipedia/commons/0/00/XuTeli%2C_Edgar_Snow_%26_Huang_Hua_1936.jpg',
    width:400, height:252,
    sourceUrl:'https://commons.wikimedia.org/wiki/File:XuTeli,_Edgar_Snow_%26_Huang_Hua_1936.jpg',
    credit:'摄影者不详；Commons 引用上海档案信息网',
    rights:'公有领域（Commons 标注 PD-China）'
  },
  4: {
    title:'八路军进入平型关', date:'1937年', year:1937,
    caption:'沙飞拍摄的八路军通过平型关关口的照片，可结合抗战初期的华北战局阅读。',
    alt:'八路军步兵与骑兵通过平型关关口的黑白历史照片',
    src:'https://upload.wikimedia.org/wikipedia/commons/c/c5/Battle_of_Pingxingguan_1937.jpg',
    width:910, height:595,
    sourceUrl:'https://commons.wikimedia.org/wiki/File:Battle_of_Pingxingguan_1937.jpg',
    credit:'摄影：沙飞；Wikimedia Commons 收录',
    rights:'公有领域（Commons 标注 PD-China / PD-1996）'
  },
  5: {
    title:'毛泽东在中共七大', date:'1945年', year:1945,
    caption:'中共七大期间的毛泽东。可与《论联合政府》及抗战后期的政治背景对照阅读。',
    alt:'毛泽东在1945年中共七大上的黑白照片',
    src:'https://upload.wikimedia.org/wikipedia/commons/6/61/Mao_at_7th_congress_CPC.jpg',
    width:400, height:270,
    sourceUrl:'https://commons.wikimedia.org/wiki/File:Mao_at_7th_congress_CPC.jpg',
    credit:'摄影者不详；Commons 引用新华网资料',
    rights:'公有领域（Commons 标注 PD-China）'
  },
  6: {
    title:'重庆谈判期间的毛泽东与蒋介石', date:'1945年', year:1945,
    caption:'抗战胜利后重庆谈判期间的合影。来源页对具体拍摄日期的记载不一致，此处仅标年份。',
    alt:'1945年重庆谈判期间毛泽东与蒋介石的黑白合影',
    src:'https://upload.wikimedia.org/wikipedia/commons/0/01/%E9%87%8D%E6%85%B6%E6%9C%83%E8%AB%87_%E8%94%A3%E4%BB%8B%E7%9F%B3%E8%88%87%E6%AF%9B%E6%BE%A4%E6%9D%B1.jpg',
    width:656, height:639,
    sourceUrl:'https://commons.wikimedia.org/wiki/File:重慶會談_蔣介石與毛澤東.jpg',
    credit:'摄影：杰克·威克尔斯（按来源署名）；Wikimedia Commons 收录',
    rights:'公有领域（Commons 标注 PD-China）'
  }
};
