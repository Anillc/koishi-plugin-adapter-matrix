# koishi-plugin-adapter-matrix

## 接入方法

1. 编写 `registry.yaml`, 参考 [Registion](https://spec.matrix.org/unstable/application-service-api/#registration)

```yaml
id: koishi # id
hs_token: # hs_token 与 as_token 没有特别的格式要求，请确保不会泄漏
as_token:
url: # 你的机器人的地址
sender_localpart: koishi # sender_localpart
namespaces:
  users:
  - exclusive: true
    regex: '@koishi:matrix.example.com' # 你的机器人的 userId。如果需要使用同样的 as_token 和 hs_token 的情况下加载多个 adapter-matrix 插件, 请使用正则表达式
```

2. 将 `registry.yaml` 添加进你的 homeserver, 如 synapse 则使用 `app_service_config_files` 配置项来指向 `registry.yaml` 并重启 homeserver
3. 启动机器人，在控制台中配置 @koishijs/plugin-verifier 与本插件
4. 在房间中邀请机器人（机器人的 ID 为 `@${selfId}:${host}`）
