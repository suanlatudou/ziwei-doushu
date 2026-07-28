import Link from 'next/link';

export const metadata = {
  title: '隐私政策 · 紫微命盘',
  description: '紫微命盘关于排盘信息、AI 辅助解读、本地存储和用户权利的隐私说明。',
};

const sectionStyle = { marginTop: 30 };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 72px', lineHeight: 1.85 }}>
      <Link href="/" style={{ color: 'var(--ac)' }}>← 返回首页</Link>
      <h1 style={{ marginTop: 24 }}>隐私政策</h1>
      <p>最后更新：2026年7月28日</p>
      <p>
        紫微命盘是一项传统文化学习与排盘工具。本政策说明本站在提供排盘和 AI 辅助解读时，
        如何处理用户主动提交的信息。本站不会出售用户个人信息，也不会将排盘信息用于广告画像。
      </p>

      <h2 style={sectionStyle}>1. 可能处理的信息</h2>
      <p>
        为生成命盘，本站可能处理用户主动填写的出生年月日、出生时间、性别和出生地点。
        用户不必填写真实姓名；除非页面明确要求，否则请勿提交身份证号、手机号、住址、银行卡等无关敏感信息。
      </p>

      <h2 style={sectionStyle}>2. 信息用途</h2>
      <p>
        排盘信息仅用于生成命盘、展示传统文化资料、完成用户主动发起的 AI 辅助解读、保障接口安全与改进服务稳定性。
        本站不会基于这些信息进行自动化信用评估、医疗诊断或其他对用户产生法律效力的决定。
      </p>

      <h2 style={sectionStyle}>3. AI 服务与必要的数据传输</h2>
      <p>
        当用户主动请求 AI 解读时，经过最小化处理的命盘结构和用户问题可能发送至第三方大语言模型服务商 DeepSeek，
        用于生成当次回复。程序会尽量移除姓名、精确地点和经纬度等非必要身份字段。
        AI 内容可能出现错误，仅供传统文化学习和个人思考。
      </p>

      <h2 style={sectionStyle}>4. 本地存储与日志</h2>
      <p>
        网站可能使用浏览器 localStorage 保存主题偏好和匿名客户端标识。用户可以通过清除浏览器站点数据删除这些内容。
        为防止滥用，服务器可能短期处理 IP 地址、浏览器信息、请求时间和接口错误记录；这些信息主要用于限流、安全审计和故障排查。
      </p>

      <h2 style={sectionStyle}>5. 缓存与保存期限</h2>
      <p>
        为减少重复调用和提升响应速度，系统可能保存经过匿名化的 AI 响应缓存，默认最长约30天；
        安全和错误日志仅在实现相关目的所需的合理期限内保留。法律法规另有要求的除外。
      </p>

      <h2 style={sectionStyle}>6. 第三方服务</h2>
      <p>
        本站托管于 Cloudflare Pages，并可能使用 Cloudflare 的安全、网络和人机验证能力。
        当用户进入第三方赞助或支付平台时，相关平台将按照其自身隐私规则处理信息；本站不会直接收集银行卡或支付密码。
      </p>

      <h2 style={sectionStyle}>7. 用户权利</h2>
      <p>
        用户可以不提交排盘信息、停止使用 AI 解读、清除浏览器本地数据，或通过项目公开渠道提出查询、更正、删除或投诉请求。
        在能够合理核验请求与相关数据对应关系的情况下，本站会依法处理。
      </p>

      <h2 style={sectionStyle}>8. 未成年人</h2>
      <p>
        未成年人应在监护人指导下使用本站，不应提交与排盘无关的个人敏感信息，也不应将 AI 输出作为重大人生决定的依据。
      </p>

      <h2 style={sectionStyle}>9. 联系与更新</h2>
      <p>
        隐私问题可通过本项目公开的 GitHub 仓库联系维护者。政策发生重要变化时，本站会更新本页日期和内容。
      </p>

      <p style={{ marginTop: 36 }}>
        继续使用本站前，请同时阅读 <Link href="/terms" style={{ color: 'var(--ac)' }}>服务条款</Link>。
      </p>
    </main>
  );
}
