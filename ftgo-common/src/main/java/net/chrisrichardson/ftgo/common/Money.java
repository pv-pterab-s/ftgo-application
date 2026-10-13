package net.chrisrichardson.ftgo.common;

import org.apache.commons.lang.builder.ToStringBuilder;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

//@Embeddable
//@Access(AccessType.FIELD)
public class Money {

  public static final Money ZERO = new Money(0);

  private final BigDecimal amount;

  private Money() {
    this.amount = null;
  }

  public Money(BigDecimal amount) {
    this.amount = Objects.requireNonNull(amount, "amount");
  }

  public Money(String s) {
    this.amount = new BigDecimal(s);
  }

  public Money(int i) {
    this.amount = new BigDecimal(i);
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;

    if (o == null || getClass() != o.getClass()) return false;

    Money money = (Money) o;

    return amount.compareTo(money.amount) == 0;
  }

  @Override
  public int hashCode() {
    return amount.stripTrailingZeros().hashCode();
  }

  @Override
  public String toString() {
    return new ToStringBuilder(this)
            .append("amount", amount)
            .toString();
  }


  public Money add(Money delta) {
    return new Money(amount.add(delta.amount));
  }

  public boolean isGreaterThanOrEqual(Money other) {
    return amount.compareTo(other.amount) >= 0;
  }

  public String asString() {
    return amount.toPlainString();
  }

  public Money multiply(int x) {
    return new Money(amount.multiply(new BigDecimal(x)));
  }

  public Long asLong() {
    return amount.movePointRight(2).setScale(0, RoundingMode.UNNECESSARY).longValueExact();
  }
}
