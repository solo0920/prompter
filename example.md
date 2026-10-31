# Markdown 七種語法範例

## 1. 標題（Headings）

# H1 第一層標題
## H2 第二層標題
### H3 第三層標題
#### H4 第四層標題
##### H5 第五層標題
###### H6 第六層標題

## 2. 無序清單（Unordered List）

- 第一個項目
  - 子項目 A
  - 子項目 B
    - 子項目 C
- 第二個項目

## 3. 有序清單（Ordered List）

1. 第一步：蒐集資料
2. 第二步：分析資料
   1. 分析財務報表
   2. 分析市場趨勢
3. 第三步：提出結論

## 4. 引用（Blockquote）

> 這是一段引用文字。
>
> 可以包含多個段落。
>
> > 也可以進行巢狀引用。

## 5. 程式碼（Code）

行內程式碼：`print("Hello World")`

```python
def calculate_return(price, cost):
    return (price - cost) / cost

print(calculate_return(120, 100))
```

## 6. 數學公式（LaTeX / KaTeX）

行內公式：報酬率為 $R = \frac{P_1-P_0}{P_0}$

區塊公式：

$$
NPV = \sum_{t=1}^{n} \frac{CF_t}{(1+r)^t} - C_0
$$

## 7. 表格（Table）

| 項目 | 數值 | 說明 |
|---|---:|---|
| 初始投資 | 100,000 | 投資本金 |
| 期末價值 | 120,000 | 投資結束價值 |
| 投資報酬 | 20,000 | 期末價值－本金 |
| 報酬率 | 20% | 投資報酬／本金 |
